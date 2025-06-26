import { NextRequest, NextResponse } from 'next/server'
import { BraveSearchClient } from '@/lib/brave-search'
import { GeminiClient } from '@/lib/gemini-client'
import { DecisionTree, ProcedureList, Procedure } from '@/lib/types'

// 決定木の構造を検証する関数
function validateDecisionTree(tree: DecisionTree | ProcedureList): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  function validateNode(node: DecisionTree | ProcedureList, path: string = 'root'): void {
    if ('procedureList' in node) {
      // ProcedureListの場合
      if (!Array.isArray(node.procedureList)) {
        errors.push(`${path}: procedureList is not an array`)
      } else if (node.procedureList.length === 0) {
        errors.push(`${path}: procedureList is empty`)
      }
      return
    }
    
    // DecisionTreeの場合
    if (!node.question || typeof node.question !== 'string') {
      errors.push(`${path}: question is missing or invalid`)
    }
    
    if (!node.key || typeof node.key !== 'string') {
      errors.push(`${path}: key is missing or invalid`)
    }
    
    if (!Array.isArray(node.options) || node.options.length === 0) {
      errors.push(`${path}: options array is missing or empty`)
    }
    
    if (!Array.isArray(node.children)) {
      errors.push(`${path}: children array is missing`)
    } else {
      // オプション数と子ノード数の一致チェック
      if (node.options && node.options.length !== node.children.length) {
        errors.push(`${path}: options count (${node.options.length}) != children count (${node.children.length})`)
      }
      
      // 各子ノードを再帰的に検証
      node.children.forEach((child, index) => {
        if (!child) {
          errors.push(`${path}.children[${index}]: child node is null or undefined`)
        } else {
          validateNode(child, `${path}.children[${index}]`)
        }
      })
    }
  }
  
  try {
    validateNode(tree)
    return { isValid: errors.length === 0, errors }
  } catch (error) {
    return { isValid: false, errors: [`Validation error: ${error}`] }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, answers = {} } = await request.json()
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json({
        mode: 'error',
        error: '検索キーワードを入力してください。',
        errorCode: 'MISSING_QUERY'
      }, { status: 400 })
    }

    // 初回検索時
    if (Object.keys(answers).length === 0) {
      // 1. Geminiを使ったキーワード展開と行政手続き関連性チェック
      const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY!)
      const expansion = await geminiClient.expandKeyword(query)
      
      if (!expansion.isAdministrative) {
        return NextResponse.json({
          mode: 'error',
          error: 'このサービスは行政手続きに関する検索のみ対応しています。具体的な手続き名や業種をお聞かせください。',
          errorCode: 'INVALID_QUERY_TYPE',
          suggestions: ['建設業許可', '飲食店営業許可', '酒類製造免許', '会社設立手続き']
        }, { status: 400 })
      }

      // 2. 展開されたキーワードでBrave Search実行
      const braveClient = new BraveSearchClient(process.env.BRAVE_API_KEY!)
      const searchQuery = expansion.expandedQuery || query
      const searchResults = await braveClient.search(searchQuery)
      
      console.log(`Search results for "${searchQuery}":`, searchResults.length)

      // 3. Gemini決定木生成
      const tree = await geminiClient.generateDecisionTree(searchResults, query)
      
      // 決定木の構造を検証
      const validationResult = validateDecisionTree(tree)
      if (!validationResult.isValid) {
        console.error('Decision tree validation failed:', validationResult.errors)
        // バリデーションに失敗した場合でも処理を続行（エラー情報はログ出力）
      }

      // 4. 最初の質問を返す
      return NextResponse.json({
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options,
        currentPath: [],
        tree, // Include the full tree
        expandedKeywords: [query, searchQuery],
        relatedProcedures: expansion.relatedProcedures,
        sources: searchResults.map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.description
        }))
      })
    }

    // 質問回答処理
    // セッションストレージから決定木を取得する必要がある
    // 簡易実装として、再度API呼び出しを行う
    const originalQuery = answers._originalQuery || query
    
    // 2. Brave Search実行
    const braveClient = new BraveSearchClient(process.env.BRAVE_API_KEY!)
    const searchResults = await braveClient.search(originalQuery)

    // 3. Gemini決定木生成
    const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY!)
    const tree = await geminiClient.generateDecisionTree(searchResults, originalQuery)
    
    // 4. 決定木を辿って次の質問または結果を返す
    const result = navigateTree(tree, answers)
    
    if (result.mode === 'question') {
      return NextResponse.json({
        mode: 'question',
        question: result.question,
        key: result.key,
        options: result.options,
        currentPath: Object.keys(answers).filter(k => k !== '_originalQuery'),
        tree,
        expandedKeywords: [originalQuery],
        sources: searchResults.map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.description
        }))
      })
    } else {
      return NextResponse.json({
        mode: 'final',
        procedures: result.procedures,
        tree,
        currentPath: Object.keys(answers).filter(k => k !== '_originalQuery'),
        sources: searchResults.map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.description
        }))
      })
    }

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({
      mode: 'error',
      error: 'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。',
      errorCode: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}


function navigateTree(tree: DecisionTree | ProcedureList, answers: Record<string, string>): {
  mode: 'question' | 'final'
  question?: string
  key?: string
  options?: string[]
  procedures?: Procedure[]
} {
  // 手続きリストの場合
  if ('procedureList' in tree) {
    return {
      mode: 'final',
      procedures: tree.procedureList
    }
  }
  
  // 現在の質問に対する回答がない場合
  if (!answers[tree.key]) {
    return {
      mode: 'question',
      question: tree.question,
      key: tree.key,
      options: tree.options
    }
  }
  
  // 回答に基づいて次のノードを探す
  const answerIndex = tree.options.indexOf(answers[tree.key])
  if (answerIndex === -1 || !tree.children[answerIndex]) {
    return {
      mode: 'question',
      question: tree.question,
      key: tree.key,
      options: tree.options
    }
  }
  
  // 再帰的に次のノードを探す
  return navigateTree(tree.children[answerIndex], answers)
}