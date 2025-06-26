import { GoogleGenerativeAI } from '@google/generative-ai'
import { SearchResult, DecisionTree } from './types'
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

    try {
      // キーワード拡張情報を取得
      const expansion = this.keywordExpander.expandKeywords(query)
      console.log(`決定木生成: ${query} → ${expansion.industryCategory} (関連手続き: ${expansion.relatedProcedures.length}件)`)
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
      const prompt = this.createEnhancedPrompt(searchResults, query, expansion)
      
      const result = await model.generateContent(prompt)
      const response = result.response
      const text = response.text()
      
      // JSONパース試行
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response')
      }
      
      const tree = JSON.parse(jsonMatch[0])
      await progressiveCache.set(cacheKey, tree, 1800) // 30分キャッシュ
      return tree
    } catch (error) {
      console.error('Enhanced Gemini generation failed:', error)
      return this.getMockDecisionTree(query)
    }
  }

  private createEnhancedPrompt(searchResults: SearchResult[], query: string, expansion: { industryCategory: string, relatedProcedures: string[], subcategories: string[], expandedKeywords: string[] }): string {
    const isMinpaku = expansion.industryCategory === '民泊・宿泊業'
    
    return `あなたは日本の行政手続きの専門家です。
以下の情報を基に、ユーザーが必要な行政手続きを特定するための詳細な質問ツリーを生成してください。

【入力情報】
検索クエリ: ${query}
業種カテゴリ: ${expansion.industryCategory}
関連手続き: ${expansion.relatedProcedures.join(', ')}
サブカテゴリ: ${expansion.subcategories.join(', ')}
拡張キーワード: ${expansion.expandedKeywords.join(', ')}

${isMinpaku ? `
【民泊事業の特別指針】
民泊事業は複雑な法的要件があるため、以下を必ず考慮してください：
1. 事業形態の選択（住宅宿泊事業法 vs 簡易宿所 vs 特区民泊）
2. 立地制限（住居専用地域の制限、自治体条例）
3. 運営方式（家主居住型 vs 家主不在型）
4. 安全・衛生基準（消防法令、建築基準法）
5. 外国人対応（本人確認、多言語対応）
6. 近隣対応（説明義務、苦情対応）
7. 税務（宿泊税、所得税、消費税）
8. 管理体制（管理業者委託、緊急時対応）

必須手続きリスト：
- 住宅宿泊事業届出
- 簡易宿所営業許可（年間180日超える場合）
- 住宅宿泊管理業者委託（家主不在型）
- 消防法令適合通知書
- 建築基準法適合確認
- 近隣住民説明
- 宿泊者名簿作成体制
- 本人確認体制構築
- 苦情対応窓口設置
- 標識設置義務
- 定期報告義務` : ''}

【重要な制約】
1. 特定された業種（${expansion.industryCategory}）に特化した質問を作成
2. 関連手続き（${expansion.relatedProcedures.join(', ')}）を必ず網羅
3. 最低4階層の深い質問構造を構築
4. 各階層で芋蔓式に関連手続きを展開
${isMinpaku ? '5. 民泊の複雑な法的要件を段階的に確認する質問を構築' : ''}

【関連手続きの必須包含】
以下の手続きは必ずどこかの分岐に含めてください：
${expansion.relatedProcedures.map((proc: string) => `- ${proc}`).join('\n')}

【質問作成の詳細指針】
1. 自明な質問は避ける
2. 具体的な分岐を作る（各質問で3〜5の選択肢）
3. 専門用語を避け、一般の人が理解できる表現を使用
4. 数値や具体的な状況で表現する
${isMinpaku ? '5. 民泊特有の複雑な要件を段階的に整理する質問にする' : ''}

検索結果: ${JSON.stringify(searchResults, null, 2)}

出力: 以下のJSON構造で、特定業種に特化した詳細な質問ツリーを生成してください。

【絶対に守るべき構造ルール】
1. optionsの配列要素数と、childrenの配列要素数は必ず同じにする
2. 例：options が3個なら、children も必ず3個
3. すべてのレベルでこのルールを守る

{
  "question": "第1階層の質問",
  "key": "level1_key",
  "options": ["選択肢1", "選択肢2", "選択肢3"],
  "children": [
    {
      "question": "第2階層の質問（選択肢1用）",
      "key": "level2_key_1", 
      "options": ["詳細選択肢1-1", "詳細選択肢1-2"],
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
        },
        {
          "procedureList": [
            {
              "procedure_id": "PROC-002",
              "name": "別の手続き名",
              "jurisdiction": "申請先機関",
              "url": "URL",
              "requirements": "必要書類",
              "deadline": "期限", 
              "fee": "手数料"
            }
          ]
        }
      ]
    },
    {
      "question": "第2階層の質問（選択肢2用）",
      "key": "level2_key_2",
      "options": ["詳細選択肢2-1"],
      "children": [
        {
          "procedureList": [
            {
              "procedure_id": "PROC-003",
              "name": "また別の手続き名",
              "jurisdiction": "申請先機関",
              "url": "URL",
              "requirements": "必要書類",
              "deadline": "期限",
              "fee": "手数料"
            }
          ]
        }
      ]
    },
    {
      "question": "第2階層の質問（選択肢3用）",
      "key": "level2_key_3",
      "options": ["詳細選択肢3-1"],
      "children": [
        {
          "procedureList": [
            {
              "procedure_id": "PROC-004",
              "name": "最後の手続き名",
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

【絶対厳守】
- optionsが3個なら、childrenも必ず3個
- optionsが2個なら、childrenも必ず2個
- この原則を全階層で守る
- 構造の整合性を最優先する

【重要】各階層で芋蔓式に関連手続きを展開し、ユーザーが必要とする可能性のあるすべての手続きを網羅してください。`
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

  private getMockDecisionTree(query: string): DecisionTree {
    // 民泊・宿泊業関連
    if (query.includes('民泊') || query.includes('インバウンド') || query.includes('Airbnb') || 
        query.includes('簡易宿所') || query.includes('宿泊') || query.includes('ゲストハウス')) {
      return minpakuMockData as DecisionTree
    }
    
    // 酒造・酒類関連
    if (query.includes('酒造') || query.includes('酒類')) {
      return alcoholMockData as DecisionTree
    }
    
    // 飲食店関連
    if (query.includes('飲食') || query.includes('レストラン') || query.includes('カフェ') || query.includes('飲食店を開きたい')) {
      return restaurantMockData as DecisionTree
    }
    
    // 建設業関連
    if (query.includes('建設') || query.includes('工事') || query.includes('建設業を始めたい')) {
      return constructionMockData as DecisionTree
    }
    
    // デフォルト
    return defaultMockData as DecisionTree
  }
}