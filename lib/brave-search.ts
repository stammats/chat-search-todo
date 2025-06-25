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
      
      // 複数クエリで並列検索
      const searchPromises = expansion.searchQueries.slice(0, 4).map((searchQuery, index) => {
        // 各検索の内容を説明
        if (index === 0) {
          this.updateStatus('基本的な手続き情報を確認中...')
        } else if (index === 1) {
          this.updateStatus('必要書類や申請方法を調査中...')
        } else if (index === 2) {
          this.updateStatus('手数料や期限情報を収集中...')
        }
        return this.performSingleSearch(searchQuery)
      })
      
      // 元のクエリでも検索
      this.updateStatus('政府機関の公式情報を確認中...')
      searchPromises.push(this.performSingleSearch(`${query} site:go.jp`))
      
      const searchResults = await Promise.all(searchPromises)
      const allResults = searchResults.flat()
      
      // 結果が空の場合はモックデータを返す
      if (allResults.length === 0) {
        console.log('No search results found, using mock data')
        return this.getMockResults(query)
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

  private async performSingleSearch(query: string): Promise<SearchResult[]> {
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

    const response = await fetch(`${this.baseUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.apiKey
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Search failed for query: ${query}`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      return []
    }

    const data = await response.json()
    return data.web?.results?.map((item: {
      title: string
      url: string
      description: string
    }) => ({
      title: item.title,
      url: item.url,
      description: item.description
    })) || []
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
    return [
      {
        title: `${query}の手引き｜関連省庁`,
        url: `https://example.go.jp/${encodeURIComponent(query)}`,
        description: `${query}に関する詳細な手続きについて説明します。必要書類、申請の流れ、手数料等をご確認ください。`
      }
    ]
  }
}