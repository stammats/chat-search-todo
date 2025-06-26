import businessKeywords from './business-keywords.json'

interface KeywordExpansion {
  expandedKeywords: string[]
  relatedProcedures: string[]
  industryCategory: string
  subcategories: string[]
  searchQueries: string[]
}

export class KeywordExpander {
  
  expandKeywords(query: string): KeywordExpansion {
    const result: KeywordExpansion = {
      expandedKeywords: [query],
      relatedProcedures: [],
      industryCategory: '',
      subcategories: [],
      searchQueries: []
    }

    // 業種の特定
    for (const [industry, data] of Object.entries(businessKeywords)) {
      if (this.matchesIndustry(query, data)) {
        result.industryCategory = industry
        result.expandedKeywords.push(...data.primaryKeywords)
        
        // サブカテゴリーの検索
        this.expandSubcategories(query, data, result)
        break
      }
    }

    // キーワードが特定の業種にマッチしない場合は、部分マッチで検索
    if (!result.industryCategory) {
      this.findPartialMatches(query, result)
    }

    // 検索クエリの最適化
    result.expandedKeywords = [...new Set(result.expandedKeywords)] // 重複除去
    result.relatedProcedures = [...new Set(result.relatedProcedures)] // 重複除去
    
    // 芋蔓式検索クエリの生成
    result.searchQueries = this.generateSearchQueries(result)
    
    return result
  }

  private matchesIndustry(query: string, industryData: { primaryKeywords: string[], [key: string]: unknown }): boolean {
    return industryData.primaryKeywords.some((keyword: string) => 
      query.includes(keyword)
    )
  }

  private expandSubcategories(query: string, industryData: { [key: string]: unknown }, result: KeywordExpansion) {
    // 各階層を再帰的に検索
    for (const [categoryName, categoryData] of Object.entries(industryData)) {
      if (categoryName === 'primaryKeywords') continue
      
      this.searchInCategory(query, categoryName, categoryData as { [key: string]: unknown }, result)
    }
  }

  private searchInCategory(query: string, categoryName: string, categoryData: { [key: string]: unknown }, result: KeywordExpansion) {
    for (const [subName, subData] of Object.entries(categoryData)) {
      if (typeof subData === 'object' && subData !== null && 'keywords' in subData && 'relatedProcedures' in subData) {
        const keywords = (subData as { keywords: string[], relatedProcedures: string[] }).keywords
        const procedures = (subData as { keywords: string[], relatedProcedures: string[] }).relatedProcedures
        
        const matches = keywords.some((keyword: string) => 
          query.includes(keyword)
        )
        
        if (matches) {
          result.subcategories.push(subName)
          result.expandedKeywords.push(...keywords)
          result.relatedProcedures.push(...procedures)
        }
      }
    }
  }

  private findPartialMatches(query: string, result: KeywordExpansion) {
    // 全業種から部分マッチを検索
    for (const [industry, data] of Object.entries(businessKeywords)) {
      // primaryKeywordsでの部分マッチ
      const primaryMatch = data.primaryKeywords.some((keyword: string) => 
        keyword.includes(query) || query.includes(keyword)
      )
      
      if (primaryMatch) {
        result.industryCategory = industry
        result.expandedKeywords.push(...data.primaryKeywords.slice(0, 3)) // 上位3つのみ
        break
      }

      // サブカテゴリでの部分マッチ
      for (const [categoryName, categoryData] of Object.entries(data)) {
        if (categoryName === 'primaryKeywords') continue
        
        for (const [subName, subData] of Object.entries(categoryData as { [key: string]: unknown })) {
          if (typeof subData === 'object' && subData !== null && 'keywords' in subData && 'relatedProcedures' in subData) {
            const keywords = (subData as { keywords: string[], relatedProcedures: string[] }).keywords
            const procedures = (subData as { keywords: string[], relatedProcedures: string[] }).relatedProcedures
            
            const partialMatch = keywords.some((keyword: string) => 
              keyword.includes(query) || query.includes(keyword)
            )
            
            if (partialMatch) {
              result.industryCategory = industry
              result.subcategories.push(subName)
              result.expandedKeywords.push(...keywords.slice(0, 2)) // 上位2つのみ
              result.relatedProcedures.push(...procedures)
              return // 最初のマッチで終了
            }
          }
        }
      }
    }
  }

  // 芋蔓式キーワード展開とクエリ生成（レート制限対策で削減）
  private generateSearchQueries(expansion: KeywordExpansion): string[] {
    const queries: string[] = []
    
    // 基本クエリ（元のクエリ + 業種キーワード、重複除去）
    if (expansion.industryCategory) {
      const baseKeywords = [...new Set(expansion.expandedKeywords.slice(0, 3))]
      queries.push(`${baseKeywords.join(' ')} 許可 申請`)
    }
    
    // 業種特化の詳細検索クエリ
    if (expansion.industryCategory === '民泊・宿泊業') {
      queries.push('民泊新法 住宅宿泊事業 届出')
      queries.push('簡易宿所 旅館業法 営業許可')
    } else if (expansion.industryCategory === '酒造・酒類') {
      queries.push('酒類製造免許 事業承継 名義変更')
      queries.push('酒造業 相続 譲渡 手続き')
    } else {
      // 手続き特化クエリ（最重要な1つのみ）
      if (expansion.relatedProcedures.length > 0) {
        queries.push(`${expansion.relatedProcedures[0]} 申請 手続き 必要書類`)
      }
    }
    
    // 重複除去して最大2クエリに制限（レート制限対策）
    return [...new Set(queries)].slice(0, 2)
  }

  // 特定業種の全関連手続きを取得（決定木生成用）
  getAllRelatedProcedures(industryCategory: string): string[] {
    if (!businessKeywords[industryCategory as keyof typeof businessKeywords]) {
      return []
    }

    const procedures: string[] = []
    const industryData = businessKeywords[industryCategory as keyof typeof businessKeywords]

    // 再帰的に全ての関連手続きを収集
    this.collectAllProcedures(industryData, procedures)
    
    return [...new Set(procedures)] // 重複除去
  }

  private collectAllProcedures(data: { [key: string]: unknown }, procedures: string[]) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'primaryKeywords') continue
      
      if (typeof value === 'object' && value !== null) {
        if ('relatedProcedures' in value && Array.isArray((value as { relatedProcedures: string[] }).relatedProcedures)) {
          procedures.push(...(value as { relatedProcedures: string[] }).relatedProcedures)
                  } else {
            this.collectAllProcedures(value as { [key: string]: unknown }, procedures)
          }
      }
    }
  }

  // デバッグ用：拡張結果をログ出力
  logExpansion(query: string, expansion: KeywordExpansion) {
    console.log('=== キーワード拡張結果 ===')
    console.log('入力クエリ:', query)
    console.log('業種カテゴリ:', expansion.industryCategory)
    console.log('サブカテゴリ:', expansion.subcategories)
    console.log('拡張キーワード:', expansion.expandedKeywords)
    console.log('関連手続き:', expansion.relatedProcedures)
    console.log('検索クエリ:', expansion.searchQueries)
    console.log('========================')
  }
} 