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

  // 芋蔓式キーワード展開とクエリ生成
  private generateSearchQueries(expansion: KeywordExpansion): string[] {
    const queries: string[] = []
    
    // 基本クエリ（元のクエリ + 業種キーワード）
    if (expansion.industryCategory) {
      queries.push(`${expansion.expandedKeywords.slice(0, 3).join(' ')} 許可 申請`)
      queries.push(`${expansion.industryCategory} 開業 手続き`)
    }
    
    // 民泊特化の詳細検索クエリ
    if (expansion.industryCategory === '民泊・宿泊業') {
      queries.push('民泊新法 住宅宿泊事業 届出 年間180日制限')
      queries.push('簡易宿所 旅館業法 営業許可 消防法令適合')
      queries.push('特区民泊 国家戦略特区 外国人滞在施設経営事業')
      queries.push('住宅宿泊管理業者 管理委託 緊急時対応体制')
      queries.push('建築基準法 用途変更 住居専用地域 都市計画法')
      queries.push('インバウンド 外国人宿泊者 本人確認 宿泊者名簿')
      queries.push('民泊 近隣対応 騒音対策 苦情処理 地域協調')
      queries.push('宿泊税 消費税 所得税 青色申告 事業税')
      queries.push('Airbnb 住宅宿泊仲介業者 プラットフォーム規制')
      queries.push('消防設備 火災報知器 避難経路 防火管理者')
    } else {
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
    }
    
    // 重複除去して最大12クエリに制限（民泊の場合は多めに）
    const maxQueries = expansion.industryCategory === '民泊・宿泊業' ? 12 : 8
    return [...new Set(queries)].slice(0, maxQueries)
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