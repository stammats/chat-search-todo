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

  private matchesIndustry(query: string, industryData: any): boolean {
    return industryData.primaryKeywords.some((keyword: string) => 
      query.includes(keyword)
    )
  }

  private expandSubcategories(query: string, industryData: any, result: KeywordExpansion) {
    // 各階層を再帰的に検索
    for (const [categoryName, categoryData] of Object.entries(industryData)) {
      if (categoryName === 'primaryKeywords') continue
      
      this.searchInCategory(query, categoryName, categoryData as any, result)
    }
  }

  private searchInCategory(query: string, categoryName: string, categoryData: any, result: KeywordExpansion) {
    for (const [subName, subData] of Object.entries(categoryData)) {
      if (typeof subData === 'object' && subData !== null && 'keywords' in subData && 'relatedProcedures' in subData) {
        const keywords = (subData as any).keywords as string[]
        const procedures = (subData as any).relatedProcedures as string[]
        
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
        
        for (const [subName, subData] of Object.entries(categoryData as any)) {
          if (typeof subData === 'object' && subData !== null && 'keywords' in subData && 'relatedProcedures' in subData) {
            const keywords = (subData as any).keywords as string[]
            const procedures = (subData as any).relatedProcedures as string[]
            
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

  // 芋蔓式キーワード展開とクエリ生成
  private generateSearchQueries(expansion: KeywordExpansion): string[] {
    const queries: string[] = []
    
    // 基本クエリ（元のクエリ + 業種キーワード）
    if (expansion.industryCategory) {
      queries.push(`${expansion.expandedKeywords.slice(0, 3).join(' ')} 許可 申請`)
      queries.push(`${expansion.industryCategory} 開業 手続き`)
    }
    
    // 手続き特化クエリ（各手続きごとに詳細検索）
    expansion.relatedProcedures.slice(0, 4).forEach(procedure => {
      queries.push(`${procedure} 申請 手続き 必要書類`)
      queries.push(`${procedure} 手数料 期限`)
    })
    
    // 業種 × 要件の組み合わせクエリ
    if (expansion.subcategories.length > 0) {
      expansion.subcategories.slice(0, 2).forEach(subcategory => {
        queries.push(`${expansion.industryCategory} ${subcategory} 許可`)
      })
    }
    
    // 法令・規制特化クエリ
    if (expansion.industryCategory) {
      queries.push(`${expansion.industryCategory} 法律 規制 コンプライアンス`)
      queries.push(`${expansion.industryCategory} 監督官庁 申請先`)
    }
    
    // 重複除去して最大8クエリに制限
    return [...new Set(queries)].slice(0, 8)
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

  private collectAllProcedures(data: any, procedures: string[]) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'primaryKeywords') continue
      
      if (typeof value === 'object' && value !== null) {
        if ('relatedProcedures' in value && Array.isArray((value as any).relatedProcedures)) {
          procedures.push(...(value as any).relatedProcedures)
        } else {
          this.collectAllProcedures(value, procedures)
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