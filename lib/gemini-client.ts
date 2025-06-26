import { GoogleGenerativeAI } from '@google/generative-ai'
import { SearchResult, DecisionTree, Procedure } from './types'
import { progressiveCache } from './progressive-cache'
import { KeywordExpander } from './keyword-expander'
import alcoholMockData from './mock-data/alcohol.json'
import restaurantMockData from './mock-data/restaurant.json'
import constructionMockData from './mock-data/construction.json'
import minpakuMockData from './mock-data/minpaku.json'
import defaultMockData from './mock-data/default.json'

export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private keywordExpander: KeywordExpander
  
  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.keywordExpander = new KeywordExpander()
  }

  async expandKeyword(query: string): Promise<{
    isAdministrative: boolean
    expandedQuery: string
    relatedProcedures: string[]
  }> {
    const cacheKey = `keyword_expansion:${query}`
    const cached = await progressiveCache.get<{
      isAdministrative: boolean
      expandedQuery: string
      relatedProcedures: string[]
    }>(cacheKey)
    if (cached) {
      console.log('Cache hit for keyword expansion:', query)
      return cached
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
      
      const prompt = `あなたは日本の行政手続きの専門家です。
以下のキーワードを分析して、行政手続きに関連するか判定し、関連する場合は適切な検索キーワードに展開してください。

入力キーワード: ${query}

【判定基準】
- 業種名（例：酒造、飲食業、建設業、民泊、宿泊業）→ 関連する許可・届出が必要
- 事業活動（例：開業、起業、営業、インバウンド事業）→ 行政手続きが必要
- 具体的な手続き名 → そのまま使用
- 天気、ニュース、一般的な情報 → 行政手続きとは無関係

【特別注意：民泊・宿泊業のキーワード拡張】
民泊、インバウンド、Airbnb、簡易宿所、短期宿泊などが含まれる場合は、以下の専門用語を含めて拡張：
- 住宅宿泊事業法（民泊新法）、簡易宿所営業許可、特区民泊
- 住宅宿泊管理業者、住宅宿泊仲介業者
- 旅館業法、建築基準法、消防法令、都市計画法
- 年間180日制限、本人確認義務、近隣説明義務
- 外国人宿泊者対応、多言語対応、宿泊税

【出力形式】
必ず以下のJSON形式で出力してください：
{
  "isAdministrative": true/false,
  "expandedQuery": "展開後の検索キーワード",
  "relatedProcedures": ["関連する手続き名1", "関連する手続き名2", ...]
}

【例】
入力: "酒造"
出力: {
  "isAdministrative": true,
  "expandedQuery": "酒類製造免許 酒造業 許可申請",
  "relatedProcedures": ["酒類製造免許", "酒類販売業免許", "食品衛生法許可"]
}

入力: "インバウンド向け民泊事業"
出力: {
  "isAdministrative": true,
  "expandedQuery": "民泊新法 住宅宿泊事業届出 簡易宿所営業許可 インバウンド 外国人宿泊者 旅館業法 建築基準法 消防法令",
  "relatedProcedures": ["住宅宿泊事業届出", "簡易宿所営業許可", "住宅宿泊管理業者委託", "消防法令適合通知書", "建築基準法適合確認", "外国人宿泊者本人確認", "近隣住民説明", "宿泊税納付"]
}

入力: "今日の天気"
出力: {
  "isAdministrative": false,
  "expandedQuery": "",
  "relatedProcedures": []
}`
      
      const result = await model.generateContent(prompt)
      const response = result.response
      const text = response.text()
      
      // JSONパース試行
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response')
      }
      
      const expansion = JSON.parse(jsonMatch[0])
      await progressiveCache.set(cacheKey, expansion, 3600) // 1時間キャッシュ
      return expansion
    } catch (error) {
      console.error('Keyword expansion failed:', error)
      // フォールバック
      return {
        isAdministrative: this.isLikelyAdministrative(query),
        expandedQuery: query,
        relatedProcedures: []
      }
    }
  }

  private isLikelyAdministrative(query: string): boolean {
    const businessKeywords = [
      '酒造', '酒類', '飲食', '建設', '製造', '販売', '小売',
      '開業', '起業', '営業', '事業', '会社', '法人', '業務',
      '民泊', '宿泊', 'Airbnb', 'インバウンド', '簡易宿所', 'ゲストハウス',
      '短期宿泊', '住宅宿泊', '外国人観光客', '旅館', 'ホテル'
    ]
    const procedureKeywords = [
      '許可', '申請', '届出', '認可', '登録', '免許', '手続き',
      '住宅宿泊事業', '旅館業法', '民泊新法', '建築基準法',
      '消防法令', '本人確認', '近隣説明', '管理業者'
    ]
    
    return businessKeywords.some(keyword => query.includes(keyword)) ||
           procedureKeywords.some(keyword => query.includes(keyword))
  }

  async generateDecisionTree(
    searchResults: SearchResult[], 
    query: string
  ): Promise<DecisionTree> {
    const cacheKey = `gemini_tree_enhanced:${query}:${JSON.stringify(searchResults).slice(0, 100)}`
    const cached = await progressiveCache.get<DecisionTree>(cacheKey)
    if (cached) {
      console.log('Cache hit for enhanced decision tree:', query)
      return cached
    }

    // 複数の生成戦略を順次試行
    const strategies = ['enhanced', 'simplified', 'minimal']
    
    for (const strategy of strategies) {
      try {
        const expansion = this.keywordExpander.expandKeywords(query)
        console.log(`決定木生成 (${strategy}): ${query} → ${expansion.industryCategory} (関連手続き: ${expansion.relatedProcedures.length}件)`)
        
        const tree = await this.tryGenerateWithStrategy(searchResults, query, expansion, strategy)
        
        // 構造の整合性を検証
        const validationError = this.validateDecisionTree(tree)
        if (validationError) {
          console.warn(`Strategy ${strategy} validation failed:`, validationError)
          continue // 次の戦略を試行
        }
        
        console.log(`Decision tree generation successful with strategy: ${strategy}`)
        await progressiveCache.set(cacheKey, tree, 1800)
        return tree
        
              } catch (error) {
          console.warn(`Strategy ${strategy} failed:`, error instanceof Error ? error.message : String(error))
          continue // 次の戦略を試行
        }
    }
    
    // すべての戦略が失敗した場合、動的モックデータを使用
    console.log('All Gemini strategies failed, using dynamic mock data')
    return this.getMockDecisionTree(query)
  }

  private async tryGenerateWithStrategy(searchResults: SearchResult[], query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }, strategy: string): Promise<DecisionTree> {
    let generationConfig, prompt
    
    switch (strategy) {
      case 'enhanced':
        generationConfig = {
          maxOutputTokens: 4096,
          temperature: 0.1,
          topK: 1,
          topP: 0.1
        }
        prompt = this.createEnhancedPrompt(searchResults, query, expansion)
        break
        
      case 'simplified':
        generationConfig = {
          maxOutputTokens: 2048,
          temperature: 0.05,
          topK: 1,
          topP: 0.05
        }
        prompt = this.createSimplifiedPrompt(searchResults, query, expansion)
        break
        
      case 'minimal':
        generationConfig = {
          maxOutputTokens: 1024,
          temperature: 0.01,
          topK: 1,
          topP: 0.01
        }
        prompt = this.createMinimalPrompt(query, expansion)
        break
        
      default:
        throw new Error(`Unknown strategy: ${strategy}`)
    }
    
    const model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite-preview-06-17",
      generationConfig
    })
    
    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()
    
    // JSONパース試行（より厳密に）
    const jsonMatch = text.match(/\{[\s\S]*?\}(?=\s*$|[\s\S]*$)/)
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response')
    }
    
    let jsonText = jsonMatch[0]
    
    // 不完全なJSONを修復試行
    if (!jsonText.endsWith('}')) {
      const openBraces = (jsonText.match(/\{/g) || []).length
      const closeBraces = (jsonText.match(/\}/g) || []).length
      const missingBraces = openBraces - closeBraces
      
      if (missingBraces > 0) {
        jsonText += '}'.repeat(missingBraces)
        console.log(`Repaired JSON by adding ${missingBraces} closing braces`)
      }
    }
    
    return JSON.parse(jsonText)
  }

  private createEnhancedPrompt(searchResults: SearchResult[], query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }): string {
    // 検索結果を要約して、トークン数を削減
    const summarizedResults = searchResults.slice(0, 6).map(result => ({
      title: result.title.slice(0, 80),
      snippet: result.description.slice(0, 120)
    }))
    
    const mainProcedures = expansion.relatedProcedures.slice(0, 5)
    
    return `行政手続きの質問ツリーを生成してください。

クエリ: ${query}
業種: ${expansion.industryCategory}
主要手続き: ${mainProcedures.join(', ')}

【必須ルール】
1. optionsとchildrenの配列サイズを必ず一致させる
2. 2階層の質問ツリーを作成
3. 各選択肢で適切な手続きを提示

【検索結果要約】
${summarizedResults.map(r => `・${r.title}: ${r.snippet}`).join('\n')}

【出力形式】JSONのみ出力:
{
  "question": "具体的な質問",
  "key": "q1",
  "options": ["選択肢1", "選択肢2"],
  "children": [
    {
      "procedureList": [{
        "procedure_id": "PROC-001",
        "name": "手続き名",
        "jurisdiction": "申請先",
        "requirements": "必要書類",
        "deadline": "期限",
        "fee": "手数料",
        "url": "URL"
      }]
    },
    {
      "procedureList": [{
        "procedure_id": "PROC-002",
        "name": "別の手続き名",
        "jurisdiction": "申請先",
        "requirements": "必要書類",
        "deadline": "期限",
        "fee": "手数料",
        "url": "URL"
      }]
    }
  ]
}`
  }
  
  private createSimplifiedPrompt(searchResults: SearchResult[], query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }): string {
    const mainProcedures = expansion.relatedProcedures.slice(0, 3)
    
    return `${expansion.industryCategory}の手続き質問ツリーを生成してください。

クエリ: ${query}
主要手続き: ${mainProcedures.join(', ')}

2階層構造で、optionsとchildrenの配列サイズを一致させてください。

JSON形式で出力:
{
  "question": "質問",
  "key": "q1", 
  "options": ["選択肢1", "選択肢2"],
  "children": [
    {"procedureList": [{"procedure_id": "PROC-001", "name": "手続き名", "jurisdiction": "申請先", "requirements": "必要書類", "deadline": "期限", "fee": "手数料", "url": "URL"}]},
    {"procedureList": [{"procedure_id": "PROC-002", "name": "手続き名", "jurisdiction": "申請先", "requirements": "必要書類", "deadline": "期限", "fee": "手数料", "url": "URL"}]}
  ]
}`
  }
  
  private createMinimalPrompt(query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }): string {
    return `${expansion.industryCategory}の手続きツリー生成。

"${query}"に対して、2つの選択肢を持つ質問ツリーをJSONで作成。

{
  "question": "どちらをお探しですか？",
  "key": "q1",
  "options": ["新規開始", "変更・承継"],
  "children": [
    {"procedureList": [{"procedure_id": "PROC-001", "name": "新規開始手続き", "jurisdiction": "申請先", "requirements": "必要書類", "deadline": "期限", "fee": "手数料", "url": "https://www.e-gov.go.jp/"}]},
    {"procedureList": [{"procedure_id": "PROC-002", "name": "変更手続き", "jurisdiction": "申請先", "requirements": "必要書類", "deadline": "期限", "fee": "手数料", "url": "https://www.e-gov.go.jp/"}]}
  ]
}`
  }

  private createPrompt(searchResults: SearchResult[], query: string): string {
    return `あなたは日本の行政手続きの専門家です。
以下の検索結果から、ユーザーが必要な行政手続きを特定するための【深い階層の】質問ツリーを生成してください。

【重要な制約】
1. 行政手続きのみに焦点を当てる
2. 許可・認可・届出・申請・免許手続きのみを対象とする
3. 一般的なビジネス相談は含めない
4. **最低でも3階層以上の深さで質問を展開する**
5. **各分岐で関連する手続きを網羅的に含める**
6. **情報の漏れを避けるため、選択肢は詳細に分岐させる**

【質問作成の原則】
1. 自明な質問は避ける
   - 悪い例：「飲食店を開業するための手続きをお探しですか？」（飲食店と検索したのは明らか）
   - 良い例：「どのような形態の飲食店ですか？」「提供する内容は？」
2. 具体的な分岐を作る（各質問で3〜5の選択肢を用意）
   - 事業形態（個人/法人/組合/フランチャイズ）
   - 営業形態（店舗/移動販売/通信販売/複合型）
   - 規模（席数、面積、従業員数）
   - 特殊要件（深夜営業、酒類提供、特定の食品、屋外営業）
   - 地域性（都道府県別の違い、条例の違い）
3. ユーザーの検索意図を前提として、次のステップを聞く
4. **関連する手続きは芋蔓式に展開する**
   - 例: 飲食店 → 食品衛生法 → 防火管理者 → 深夜営業届 → 風営法許可

【選択肢作成の重要ルール】
1. 専門用語や法令名を避ける
   - 悪い例：「建設リサイクル法に基づく」「食品衛生法第52条」
   - 良い例：「建物の解体を含む工事（延床面積80㎡以上）」「食品を調理・販売する」
2. 具体的な状況や数値で表現
   - 悪い例：「大規模工事」「特定建設資材」
   - 良い例：「工事費500万円以上」「コンクリート・木材を使用する工事」
3. 一般の人が自分の状況と照らし合わせられる表現
   - 悪い例：「第一種動物取扱業」「特定遊興飲食店」
   - 良い例：「ペットの販売・預かり・訓練など」「深夜0時以降にお酒を提供する店」
4. 必要に応じて補足説明を括弧内に追加
   - 例：「アルコール度数1%以上の飲料を提供する（ビール、日本酒、ワインなど）」

【業種別の具体的な分岐例（深い階層で展開）】
- 飲食業：
  第1階層: 営業形態（店舗/キッチンカー/デリバリー専門/製造販売）
  第2階層: 提供内容（一般飲食/酒類提供/生もの/菓子製造）
  第3階層: 営業時間・規模（深夜営業/早朝営業/席数/面積）
  第4階層: 付帯設備（カラオケ/ダンス/屋外席/喫煙室）
  関連手続き: 食品営業許可、防火管理者、深夜酒類提供、風営法、道路使用許可

- 酒造・酒類：
  第1階層: 事業内容（製造/輸入/販売/飲食提供）
  第2階層: 酒類の種類（清酒/ビール/ワイン/リキュール）
  第3階層: 販売形態（店舗/通販/卸売/小売）
  第4階層: 規模・地域（年間製造量/販売地域/輸出入）
  関連手続き: 酒類製造免許、酒類販売免許、食品衛生、輸出入許可

- 建設業：
  第1階層: 事業形態（元請/下請/一人親方/建設業許可不要）
  第2階層: 工事種類（建築/土木/電気/管/解体）
  第3階層: 工事規模（請負金額/工期/従業員数）
  第4階層: 特殊要件（公共工事/民間工事/リフォーム/新築）
  関連手続き: 建設業許可、解体工事業登録、産廃収集運搬、宅建業

検索クエリ: ${query}
検索結果: ${JSON.stringify(searchResults, null, 2)}

【選択肢の良い例と悪い例】
質問：「建設工事の内容を教えてください」
✅ 良い選択肢：
- 「建物を解体する工事（延床面積80㎡以上）」
- 「コンクリートや木材を使う工事（500万円以上）」
- 「個人住宅の小規模な修繕（500万円未満）」

❌ 悪い選択肢：
- 「建設リサイクル法対象工事」
- 「特定建設資材廃棄物」
- 「建築基準法第6条1項4号」

出力: 以下のJSON構造で【最低3階層以上の深い】質問ツリーを生成してください。
すべての分岐で関連する手続きを網羅的に含め、情報の取りこぼしがないようにしてください。

{
  "question": "第1階層の質問",
  "key": "level1_key",
  "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "children": [
    {
      "question": "第2階層の質問",
      "key": "level2_key",
      "options": ["詳細選択肢1", "詳細選択肢2", "詳細選択肢3"],
      "children": [
        {
          "question": "第3階層の質問",
          "key": "level3_key",
          "options": ["さらに詳細な選択肢1", "さらに詳細な選択肢2"],
          "children": [
            {
              "procedureList": [
                {
                  "procedure_id": "PROC-001",
                  "name": "手続き名",
                  "jurisdiction": "申請先機関",
                  "url": "URL",
                  "requirements": "必要書類",
                  "deadline": "期限",
                  "fee": "手数料"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

【重要】各階層で芋蔓式に関連手続きを展開し、ユーザーが必要とする可能性のあるすべての手続きを網羅してください。`
  }

  private validateDecisionTree(tree: any): string | null {
    if (!tree || typeof tree !== 'object') {
      return 'Root object is missing or invalid'
    }
    
    if (!tree.question || !tree.key || !Array.isArray(tree.options) || !Array.isArray(tree.children)) {
      return 'Root object missing required properties'
    }
    
    if (tree.options.length !== tree.children.length) {
      return `Root: options count (${tree.options.length}) != children count (${tree.children.length})`
    }
    
    return this.validateDecisionTreeRecursive(tree, 'root')
  }
  
  private validateDecisionTreeRecursive(node: any, path: string): string | null {
    if (!node.children || !Array.isArray(node.children)) {
      return null // リーフノードは問題ない
    }
    
    if (!node.options || !Array.isArray(node.options)) {
      return `${path}: options is not an array`
    }
    
    if (node.options.length !== node.children.length) {
      return `${path}: options count (${node.options.length}) != children count (${node.children.length})`
    }
    
    // 子ノードを再帰的に検証
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const childPath = `${path}.children[${i}]`
      
      if (child.procedureList) {
        // リーフノード（手続きリスト）は検証スキップ
        continue
      }
      
      const childError = this.validateDecisionTreeRecursive(child, childPath)
      if (childError) {
        return childError
      }
    }
    
    return null
  }

  private getMockDecisionTree(query: string): DecisionTree {
    console.log(`Generating dynamic mock decision tree for query: ${query}`)
    
    // キーワード拡張を使用して業種と関連手続きを取得
    const expansion = this.keywordExpander.expandKeywords(query)
    
    return this.generateDynamicDecisionTree(query, expansion)
  }
  
  private generateDynamicDecisionTree(query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }): DecisionTree {
    const { industryCategory, relatedProcedures, subcategories } = expansion
    
    // より詳細な3階層の問診ツリーを生成
    const businessTypeQuestion = this.generateBusinessTypeQuestion(industryCategory)
    const detailedQuestions = this.generateDetailedQuestionFlow(industryCategory, relatedProcedures, subcategories)
    
    return {
      question: `${industryCategory}での${query}について、どのような形態で事業を行いますか？`,
      key: `${industryCategory.toLowerCase().replace(/[・]/g, '_')}_business_type`,
      options: businessTypeQuestion.options,
      children: businessTypeQuestion.options.map((option, index) => ({
        question: detailedQuestions[index]?.question || `${option}での具体的な事業内容は？`,
        key: `business_detail_${index}`,
        options: detailedQuestions[index]?.options || this.generateDefaultDetailOptions(industryCategory),
        children: (detailedQuestions[index]?.options || this.generateDefaultDetailOptions(industryCategory)).map((detailOption, detailIndex) => ({
          question: `${detailOption}に関して、どの段階の手続きが必要ですか？`,
          key: `procedure_stage_${index}_${detailIndex}`,
          options: ["事業開始前の許可・免許", "事業開始時の届出・申請", "事業運営中の継続手続き", "事業変更・拡大時の手続き"],
          children: [
            { procedureList: this.generateProcedureListForStage(option, detailOption, relatedProcedures, "開始前", 0) },
            { procedureList: this.generateProcedureListForStage(option, detailOption, relatedProcedures, "開始時", 1) },
            { procedureList: this.generateProcedureListForStage(option, detailOption, relatedProcedures, "運営中", 2) },
            { procedureList: this.generateProcedureListForStage(option, detailOption, relatedProcedures, "変更時", 3) }
          ]
        }))
      }))
    }
  }
  
  private generateBusinessTypeQuestion(industryCategory: string): { options: string[] } {
    // 業種に応じた基本的な事業形態パターン
    const commonPatterns = [
      "新規事業を開始する",
      "既存事業を承継・引き継ぐ", 
      "事業を拡大・変更する",
      "個人事業主として始める",
      "法人として開始する"
    ]
    
    // 業種別の特殊パターンを追加
    const industrySpecificPatterns: { [key: string]: string[] } = {
      "飲食業": ["店舗での営業", "移動販売・キッチンカー", "デリバリー・テイクアウト専門", "カフェ・喫茶店", "居酒屋・バー"],
      "建設業": ["元請業者として", "下請業者として", "個人で小規模工事", "特定建設業", "一般建設業"],
      "民泊・宿泊業": ["住宅宿泊事業（年180日以内）", "簡易宿所営業（年中営業）", "旅館業法による営業", "特区民泊", "農家民宿"],
      "酒造・酒類": ["お酒を製造する", "お酒を販売する", "輸入・輸出する", "酒類の卸売", "酒類の小売"],
      "運送業": ["一般貨物自動車運送", "特定貨物自動車運送", "軽貨物運送", "旅客運送", "特殊車両運送"],
      "介護・福祉": ["訪問介護サービス", "デイサービス・通所", "施設運営", "居宅介護支援", "福祉用具貸与"]
    }
    
    const specificOptions = industrySpecificPatterns[industryCategory] || []
    
    return {
      options: specificOptions.length > 0 ? specificOptions : commonPatterns
    }
  }

  private generateDetailedQuestionFlow(industryCategory: string, relatedProcedures: string[], subcategories: string[]): Array<{ question: string, options: string[] }> {
    const industrySpecificDetails: { [key: string]: Array<{ question: string, options: string[] }> } = {
      "飲食業": [
        { question: "どのような飲食店を営業しますか？", options: ["レストラン・食堂", "カフェ・喫茶店", "居酒屋・バー", "テイクアウト専門", "ケータリング"] },
        { question: "店舗の規模と設備は？", options: ["小規模店舗（30席未満）", "中規模店舗（30-100席）", "大規模店舗（100席以上）", "移動販売車", "キッチンスペースのみ"] },
        { question: "営業形態の詳細は？", options: ["通常営業のみ", "深夜営業も行う", "アルコール提供あり", "持ち帰り・配達のみ", "イベント出店"] },
        { question: "食材の取り扱い範囲は？", options: ["一般的な調理のみ", "生ものの取り扱い", "食肉の処理", "乳製品の製造", "特殊な食材"] },
        { question: "従業員の雇用予定は？", options: ["個人のみ", "家族経営", "パート・アルバイト雇用", "正社員雇用", "多店舗展開予定"] }
      ],
      "建設業": [
        { question: "どのような建設工事を行いますか？", options: ["住宅建築", "商業施設建築", "土木工事", "電気工事", "管工事"] },
        { question: "元請・下請の形態は？", options: ["元請業者として", "下請専門", "両方対応", "特定の元請との契約", "公共工事も対応"] },
        { question: "工事の規模は？", options: ["軽微な工事のみ", "500万円未満の工事", "500万円以上の工事", "1億円以上の大規模工事", "特殊工事"] },
        { question: "技術者・作業員の体制は？", options: ["個人作業", "数名のチーム", "10名以上の体制", "専門技術者在籍", "外部技術者協力"] },
        { question: "営業エリアは？", options: ["地元中心", "都道府県内", "広域対応", "全国対応", "海外展開予定"] }
      ],
      "民泊・宿泊業": [
        { question: "どのような宿泊施設を運営しますか？", options: ["一軒家貸切", "部屋貸し", "シェアハウス型", "簡易宿所", "旅館・ホテル"] },
        { question: "営業日数の制限は？", options: ["年180日以内（住宅宿泊）", "年中営業（簡易宿所）", "季節限定営業", "週末のみ", "イベント時のみ"] },
        { question: "宿泊者の対象は？", options: ["日本人のみ", "外国人観光客中心", "ビジネス客", "長期滞在者", "特定グループ"] },
        { question: "施設の管理体制は？", options: ["自己管理", "管理業者委託", "一部委託", "完全委託", "共同管理"] },
        { question: "サービスの範囲は？", options: ["宿泊のみ", "食事提供あり", "体験プログラム", "送迎サービス", "総合サービス"] }
      ]
    }
    
    const defaultQuestions = [
      { question: "事業の規模は？", options: ["小規模事業", "中規模事業", "大規模事業", "段階的拡大", "多店舗・多拠点"] },
      { question: "従業員の雇用は？", options: ["個人事業", "家族経営", "従業員雇用", "多数雇用", "専門職雇用"] },
      { question: "営業エリアは？", options: ["地域限定", "市内全域", "都道府県内", "広域展開", "全国展開"] },
      { question: "特別な許可は？", options: ["一般的な許可のみ", "特殊な許可必要", "複数許可必要", "段階的取得", "継続更新必要"] },
      { question: "事業の継続期間は？", options: ["短期事業", "中期事業", "長期事業", "永続事業", "期間未定"] }
    ]
    
    return industrySpecificDetails[industryCategory] || defaultQuestions
  }

  private generateDefaultDetailOptions(industryCategory: string): string[] {
    const defaultOptions: { [key: string]: string[] } = {
      "飲食業": ["一般飲食店", "喫茶店", "居酒屋", "テイクアウト", "ケータリング"],
      "建設業": ["住宅工事", "商業施設", "土木工事", "設備工事", "専門工事"],
      "民泊・宿泊業": ["住宅宿泊", "簡易宿所", "旅館業", "特区民泊", "体験型宿泊"],
      "酒造・酒類": ["製造業", "卸売業", "小売業", "輸入業", "通信販売"],
      "運送業": ["貨物運送", "旅客運送", "特殊運送", "宅配業", "引越業"],
      "介護・福祉": ["訪問介護", "通所介護", "施設介護", "居宅支援", "福祉用具"]
    }
    
    return defaultOptions[industryCategory] || ["一般事業", "特殊事業", "複合事業", "専門事業", "総合事業"]
  }
  
  private generateProcedureOptions(relatedProcedures: string[], subcategories: string[]): Array<{ question: string, options: string[] }> {
    // 関連手続きの種類に基づいて選択肢を生成
    const procedureTypes = this.categorizeProcedures(relatedProcedures)
    
    return [
      {
        question: "事業規模と形態は？",
        options: ["個人事業主として", "法人として", "組合・団体として"]
      },
      {
        question: "どのような許可・免許が必要ですか？",
        options: procedureTypes.licenses.length > 0 ? procedureTypes.licenses : ["営業許可", "業務許可", "設備許可"]
      },
      {
        question: "届出や申請の種類は？",
        options: procedureTypes.notifications.length > 0 ? procedureTypes.notifications : ["事業開始届", "変更届", "廃止届"]
      }
    ]
  }
  
  private categorizeProcedures(procedures: string[]): { licenses: string[], notifications: string[], registrations: string[] } {
    const categories = {
      licenses: [] as string[],
      notifications: [] as string[],
      registrations: [] as string[]
    }
    
    procedures.forEach(procedure => {
      if (procedure.includes('免許') || procedure.includes('許可')) {
        categories.licenses.push(procedure)
      } else if (procedure.includes('届出') || procedure.includes('申告')) {
        categories.notifications.push(procedure)
      } else {
        categories.registrations.push(procedure)
      }
    })
    
    return categories
  }
  
  private generateProcedureListForOption(option: string, subOption: string, relatedProcedures: string[], index: number): Procedure[] {
    // 関連手続きから適切な手続きを選択して詳細情報を生成
    const baseProcedures = relatedProcedures.slice(index * 2, (index + 1) * 2)
    
    if (baseProcedures.length === 0) {
      // フォールバック：一般的な手続きを生成
      return [{
        procedure_id: `PROC-${Date.now()}-${index}`,
        name: `${option}に関する${subOption}`,
        jurisdiction: this.getJurisdictionForProcedure(option),
        url: "https://www.e-gov.go.jp/",
        requirements: this.getRequirementsForProcedure(option, subOption),
        deadline: "事業開始前または開始から1ヶ月以内",
        fee: this.getFeeForProcedure(option)
      }]
    }
    
    return baseProcedures.map((procedure, procIndex) => ({
      procedure_id: `PROC-${Date.now()}-${index}-${procIndex}`,
      name: procedure,
      jurisdiction: this.getJurisdictionForProcedure(procedure),
      url: "https://www.e-gov.go.jp/",
      requirements: this.getRequirementsForProcedure(procedure, subOption),
      deadline: this.getDeadlineForProcedure(procedure),
      fee: this.getFeeForProcedure(procedure)
    }))
  }

  private generateProcedureListForStage(businessType: string, detailOption: string, relatedProcedures: string[], stage: string, stageIndex: number): Procedure[] {
    // 事業段階に応じた手続きを生成
    const stageSpecificProcedures = this.getStageSpecificProcedures(businessType, detailOption, stage)
    const relevantProcedures = relatedProcedures.slice(stageIndex * 3, (stageIndex + 1) * 3)
    
    // 段階固有の手続きと関連手続きを組み合わせ
    const allProcedures = [...stageSpecificProcedures, ...relevantProcedures]
    
    return allProcedures.slice(0, 6).map((procedure, index) => ({
      procedure_id: `PROC-${Date.now()}-${stageIndex}-${index}`,
      name: procedure,
      jurisdiction: this.getJurisdictionForProcedure(procedure),
      url: "https://www.e-gov.go.jp/",
      requirements: this.getRequirementsForProcedure(procedure, `${detailOption}（${stage}）`),
      deadline: this.getStageSpecificDeadline(stage),
      fee: this.getFeeForProcedure(procedure)
    }))
  }

  private getStageSpecificProcedures(businessType: string, detailOption: string, stage: string): string[] {
    const stageMap: { [key: string]: string[] } = {
      "開始前": [
        `${businessType}の営業許可申請`,
        `${businessType}の事業計画書提出`,
        `${detailOption}の設備基準確認`,
        "法人設立登記（法人の場合）",
        "税務署への開業届出書作成準備"
      ],
      "開始時": [
        `${businessType}の開業届出`,
        `${detailOption}の営業開始報告`,
        "税務署への青色申告承認申請",
        "社会保険・労働保険の加入手続き",
        "消防署への防火管理者選任届"
      ],
      "運営中": [
        `${businessType}の定期報告書提出`,
        `${detailOption}の更新手続き`,
        "税務申告・納税手続き",
        "労働基準監督署への報告",
        "業界団体への加入・報告"
      ],
      "変更時": [
        `${businessType}の変更届出`,
        `${detailOption}の変更許可申請`,
        "事業内容変更の許可申請",
        "設備変更の届出",
        "従業員数変更の報告"
      ]
    }
    
    return stageMap[stage] || [`${businessType}に関する${stage}の手続き`]
  }

  private getStageSpecificDeadline(stage: string): string {
    const deadlineMap: { [key: string]: string } = {
      "開始前": "事業開始の1-3ヶ月前",
      "開始時": "事業開始から1ヶ月以内",
      "運営中": "定期的（年1回または随時）",
      "変更時": "変更から2週間以内"
    }
    
    return deadlineMap[stage] || "要確認"
  }
  
  private getJurisdictionForProcedure(procedure: string): string {
    if (procedure.includes('税') || procedure.includes('酒類') || procedure.includes('法人')) {
      return "税務署"
    }
    if (procedure.includes('食品') || procedure.includes('衛生') || procedure.includes('保健')) {
      return "保健所"
    }
    if (procedure.includes('建設') || procedure.includes('建築')) {
      return "都道府県庁・建設業許可担当"
    }
    if (procedure.includes('登記') || procedure.includes('会社')) {
      return "法務局"
    }
    if (procedure.includes('労働') || procedure.includes('社会保険')) {
      return "労働基準監督署・年金事務所"
    }
    return "市区町村役場・都道府県庁"
  }
  
  private getRequirementsForProcedure(procedure: string, context: string): string {
    const commonDocs = ["申請書", "身分証明書", "印鑑証明書"]
    
    if (procedure.includes('営業') || procedure.includes('事業')) {
      return [...commonDocs, "事業計画書", "施設の図面", "資格証明書"].join("、")
    }
    if (procedure.includes('建設') || procedure.includes('工事')) {
      return [...commonDocs, "経営業務管理責任者証明", "専任技術者証明", "財産的基礎証明"].join("、")
    }
    if (procedure.includes('食品') || procedure.includes('飲食')) {
      return [...commonDocs, "食品衛生責任者資格", "施設の設計図", "設備一覧"].join("、")
    }
    
    return commonDocs.join("、")
  }
  
  private getDeadlineForProcedure(procedure: string): string {
    if (procedure.includes('開業') || procedure.includes('開始')) {
      return "事業開始から1ヶ月以内"
    }
    if (procedure.includes('承継') || procedure.includes('相続')) {
      return "相続開始から6ヶ月以内"
    }
    if (procedure.includes('変更')) {
      return "変更から2週間以内"
    }
    return "事業開始前"
  }
  
  private getFeeForProcedure(procedure: string): string {
    if (procedure.includes('免許') || procedure.includes('許可')) {
      if (procedure.includes('酒類') || procedure.includes('建設')) {
        return "登録免許税：15万円"
      }
      return "登録免許税：3万円〜15万円"
    }
    if (procedure.includes('届出') || procedure.includes('申告')) {
      return "無料"
    }
    return "数千円〜数万円"
  }
}