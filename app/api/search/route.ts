import { NextRequest, NextResponse } from 'next/server'
import { BraveSearchClient } from '@/lib/brave-search'
import { GeminiClient } from '@/lib/gemini-client'
import { DecisionTree, ProcedureList, Procedure } from '@/lib/types'

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

      // 4. 最初の質問を返す
      return NextResponse.json({
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options,
        currentPath: [],
        tree, // Include the full tree
        expandedKeywords: [query, searchQuery],
        relatedProcedures: expansion.relatedProcedures
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
        expandedKeywords: [originalQuery]
      })
    } else {
      return NextResponse.json({
        mode: 'final',
        procedures: result.procedures,
        tree,
        currentPath: Object.keys(answers).filter(k => k !== '_originalQuery')
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