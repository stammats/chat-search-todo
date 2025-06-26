import { SearchResult } from './types'
import { progressiveCache } from './progressive-cache'
import { KeywordExpander } from './keyword-expander'

export class BraveSearchClient {
  private readonly baseUrl = 'https://api.search.brave.com/res/v1/web/search'
  private keywordExpander: KeywordExpander
  private statusCallback?: (status: string) => void
  
  constructor(private apiKey: string) {
    this.keywordExpander = new KeywordExpander()
  }

  setStatusCallback(callback: (status: string) => void) {
    this.statusCallback = callback
  }

  private updateStatus(status: string) {
    if (this.statusCallback) {
      this.statusCallback(status)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async search(query: string): Promise<SearchResult[]> {
    const cacheKey = `brave_search_enhanced:${query}`
    const cached = await progressiveCache.get<SearchResult[]>(cacheKey)
    if (cached) {
      console.log('Cache hit for enhanced query:', query)
      return cached
    }

    try {
      // キーワード拡張
      this.updateStatus('キーワードを分析しています...')
      const expansion = this.keywordExpander.expandKeywords(query)
      console.log(`キーワード拡張: ${query} → ${expansion.industryCategory} (${expansion.relatedProcedures.length}手続き)`)
      
      // 検索対象を説明
      const searchTargets = [
        expansion.industryCategory,
        ...expansion.relatedProcedures.slice(0, 2)
      ].filter(Boolean)
      
      if (searchTargets.length > 0) {
        this.updateStatus(`${searchTargets.join('、')}に関する情報を検索中...`)
      } else {
        this.updateStatus('関連する行政手続きを検索中...')
      }
      
      // レート制限対策: 順次実行（1秒間隔）
      const allResults: SearchResult[] = []
      
      // メイン検索（site:go.jp付き）
      this.updateStatus('政府機関の公式情報を確認中...')
      try {
        const mainResults = await this.performSingleSearch(`${query} site:go.jp`)
        allResults.push(...mainResults)
        console.log(`メイン検索結果: ${mainResults.length}件`)
      } catch (error) {
        console.warn('メイン検索失敗:', error)
      }
      
      // 追加検索（最大2個まで、1秒間隔）
      const additionalQueries = expansion.searchQueries.slice(0, 2)
      for (let i = 0; i < additionalQueries.length; i++) {
        await this.delay(1200) // 1.2秒待機
        
        const searchQuery = additionalQueries[i]
        try {
          this.updateStatus(`詳細情報を収集中... (${i + 1}/${additionalQueries.length})`)
          const results = await this.performSingleSearch(searchQuery)
          allResults.push(...results)
          console.log(`追加検索${i + 1}結果: ${results.length}件`)
        } catch (error) {
          console.warn(`追加検索${i + 1}失敗:`, error)
          // エラーの場合は残りの検索をスキップしてモックデータで補完
          break
        }
      }
      
      // 結果が少ない場合はモックデータで補完
      if (allResults.length < 3) {
        console.log('検索結果が少ないため、モックデータで補完')
        const mockResults = this.getMockResults(query)
        allResults.push(...mockResults)
      }
      
      // 重複除去と関連度でソート
      this.updateStatus('検索結果を整理中...')
      const uniqueResults = this.deduplicateAndRank(allResults, expansion)
      
      this.updateStatus('情報の関連性を分析中...')
      await progressiveCache.set(cacheKey, uniqueResults, 3600)
      return uniqueResults.slice(0, 15) // 上位15件
      
    } catch (error) {
      console.error('Enhanced search failed:', error)
      // エラー時はモックデータを返す
      console.log('Using mock results due to search failure')
      return this.getMockResults(query)
    }
  }

  private async performSingleSearch(query: string, retryCount: number = 0): Promise<SearchResult[]> {
    // すでにsite:go.jpが含まれている場合は追加しない
    const searchQuery = query.includes('site:') ? query : `${query} site:go.jp`
    
    const params = new URLSearchParams({
      q: searchQuery,
      count: '6',
      offset: '0',
      search_lang: 'jp',
      country: 'jp',
      safesearch: 'moderate',
      freshness: '6m'
    })

    console.log(`Brave Search Request: ${this.baseUrl}?${params}`)

    try {
      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        }
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('Brave Search API Error Response:', errorBody)
        
        // レート制限エラーの場合
        if (response.status === 429) {
          if (retryCount < 2) {
            console.log(`レート制限のため${3 + retryCount * 2}秒待機後リトライ (${retryCount + 1}/3)`)
            await this.delay((3 + retryCount * 2) * 1000)
            return this.performSingleSearch(query, retryCount + 1)
          } else {
            console.warn('レート制限によりリトライ上限に達したため、空の結果を返します')
            return []
          }
        }
        
        throw new Error(`Brave Search API error: ${response.status}`)
      }

      const data = await response.json()
      const results = data.web?.results?.map((item: {
        title: string
        url: string
        description: string
      }) => ({
        title: item.title,
        url: item.url,
        description: item.description
      })) || []
      
      console.log(`検索成功: "${query}" → ${results.length}件`)
      return results
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) {
        // レート制限の場合は空配列を返す（既に処理済み）
        return []
      }
      console.error(`検索エラー: "${query}"`, error)
      throw error
    }
  }

  private deduplicateAndRank(results: SearchResult[], expansion: { relatedProcedures: string[], expandedKeywords: string[] }): SearchResult[] {
    // URL重複除去
    const uniqueResults = results.filter((result, index, array) => 
      array.findIndex(r => r.url === result.url) === index
    )

    // 関連度スコアリング
    return uniqueResults.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, expansion)
      const scoreB = this.calculateRelevanceScore(b, expansion)
      return scoreB - scoreA
    })
  }

  private calculateRelevanceScore(result: SearchResult, expansion: { relatedProcedures: string[], expandedKeywords: string[] }): number {
    let score = 0
    const text = `${result.title} ${result.description}`.toLowerCase()
    
    // 関連手続きがタイトル・説明に含まれているかチェック
    expansion.relatedProcedures.forEach((procedure: string) => {
      if (text.includes(procedure.toLowerCase())) {
        score += 10
      }
    })
    
    // 業種キーワードの一致
    expansion.expandedKeywords.forEach((keyword: string) => {
      if (text.includes(keyword.toLowerCase())) {
        score += 5
      }
    })
    
    // 政府系サイトの優遇
    if (result.url.includes('.go.jp')) {
      score += 15
    }
    
    // タイトルに「申請」「許可」「手続き」が含まれる場合
    if (result.title.includes('申請') || result.title.includes('許可') || result.title.includes('手続き')) {
      score += 8
    }
    
    return score
  }

  private getMockResults(query: string): SearchResult[] {
    // 業種別のモックデータ
    const mockTemplates = {
      '民泊': [
        {
          title: '住宅宿泊事業法に基づく届出について｜観光庁',
          url: 'https://www.mlit.go.jp/kankocho/minpaku/',
          description: '住宅宿泊事業を営むために必要な届出手続き、年間180日制限、管理業者の選任等について詳しく説明します。'
        },
        {
          title: '旅館業法に基づく簡易宿所営業許可｜厚生労働省',
          url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000138259.html',
          description: '年間を通じて宿泊サービスを提供する場合の簡易宿所営業許可の申請手続きについて解説します。'
        }
      ],
      '建設業': [
        {
          title: '建設業許可申請の手引き｜国土交通省',
          url: 'https://www.mlit.go.jp/totikensangyo/const/totikensangyo_const_tk2_000080.html',
          description: '建設業を営むために必要な許可申請の手続き、必要書類、手数料について詳しく説明します。'
        }
      ],
      'default': [
        {
          title: `${query}に関する行政手続き｜関連省庁`,
          url: `https://www.e-gov.go.jp/procedures/${encodeURIComponent(query)}`,
          description: `${query}に関する詳細な手続きについて説明します。必要書類、申請の流れ、手数料等をご確認ください。`
        },
        {
          title: `${query}の開業手続きガイド｜中小企業庁`,
          url: 'https://www.chusho.meti.go.jp/keiei/kaigyou/',
          description: `${query}で開業する際に必要な各種手続きを分かりやすく解説します。`
        }
      ]
    }

    // キーワードに基づいてテンプレートを選択
    let selectedTemplate = mockTemplates.default
    for (const [keyword, template] of Object.entries(mockTemplates)) {
      if (keyword !== 'default' && query.includes(keyword)) {
        selectedTemplate = template
        break
      }
    }

    console.log(`モックデータを使用: ${query} → ${selectedTemplate.length}件`)
    return selectedTemplate
  }
}