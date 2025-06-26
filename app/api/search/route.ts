import { NextRequest, NextResponse } from 'next/server'
import { BraveSearchClient } from '@/lib/brave-search'
import { GeminiClient } from '@/lib/gemini-client'
import { KeywordExpander } from '@/lib/keyword-expander'
import { DecisionTree, ProcedureList, Procedure } from '@/lib/types'

// 決定木の構造を検証・修正する関数
function validateAndFixDecisionTree(tree: DecisionTree | ProcedureList): { 
  tree: DecisionTree | ProcedureList; 
  isValid: boolean; 
  errors: string[]; 
  fixes: string[] 
} {
  const errors: string[] = []
  const fixes: string[] = []
  
  function fixNode(node: DecisionTree | ProcedureList, path: string = 'root'): DecisionTree | ProcedureList {
    if ('procedureList' in node) {
      // ProcedureListの場合
      if (!Array.isArray(node.procedureList)) {
        errors.push(`${path}: procedureList is not an array`)
        return { procedureList: [] }
      } else if (node.procedureList.length === 0) {
        errors.push(`${path}: procedureList is empty`)
      }
      return node
    }
    
    // DecisionTreeの場合
    if (!node.question || typeof node.question !== 'string') {
      errors.push(`${path}: question is missing or invalid`)
      node.question = '選択してください'
      fixes.push(`${path}: Fixed missing question`)
    }
    
    if (!node.key || typeof node.key !== 'string') {
      errors.push(`${path}: key is missing or invalid`)
      node.key = `auto_key_${Math.random().toString(36).substr(2, 9)}`
      fixes.push(`${path}: Generated auto key`)
    }
    
    if (!Array.isArray(node.options) || node.options.length === 0) {
      errors.push(`${path}: options array is missing or empty`)
      node.options = ['続行']
      fixes.push(`${path}: Added default option`)
    }
    
    if (!Array.isArray(node.children)) {
      errors.push(`${path}: children array is missing`)
      node.children = []
      fixes.push(`${path}: Added empty children array`)
    }
    
    // オプション数と子ノード数の不整合を修正
    if (node.options && node.children && node.options.length !== node.children.length) {
      errors.push(`${path}: options count (${node.options.length}) != children count (${node.children.length})`)
      
      // 有効な子ノードのみを保持
      const validChildren = node.children.filter(child => 
        child && (('question' in child && child.question) || ('procedureList' in child && Array.isArray(child.procedureList)))
      )
      
      if (validChildren.length > 0) {
        // オプションを有効な子ノード数に合わせる
        node.children = validChildren
        node.options = node.options.slice(0, validChildren.length)
        fixes.push(`${path}: Adjusted options (${node.options.length}) to match valid children (${validChildren.length})`)
      } else {
        // 有効な子ノードがない場合は、空の手続きリストを作成
        node.children = [{ procedureList: [] }]
        node.options = node.options.slice(0, 1)
        fixes.push(`${path}: Created fallback child with empty procedure list`)
      }
    }
    
    // 各子ノードを再帰的に修正
    node.children = node.children.map((child, index) => {
      if (!child) {
        errors.push(`${path}.children[${index}]: child node is null or undefined`)
        const fallbackChild = { procedureList: [] }
        fixes.push(`${path}.children[${index}]: Created fallback child`)
        return fallbackChild
      } else {
        return fixNode(child, `${path}.children[${index}]`)
      }
    })
    
    return node
  }
  
  try {
    const fixedTree = fixNode(JSON.parse(JSON.stringify(tree))) // Deep copy
    return { 
      tree: fixedTree, 
      isValid: errors.length === 0, 
      errors, 
      fixes 
    }
  } catch (error) {
    return { 
      tree, 
      isValid: false, 
      errors: [`Validation error: ${error}`], 
      fixes: [] 
    }
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
      // 業種分類の決定
      const keywordExpander = new KeywordExpander()
      const expansion = keywordExpander.expandKeywords(query)
      console.log(`=== 検索分析 ===`)
      console.log(`検索クエリ: "${query}"`)
      console.log(`分類された業種: ${expansion.industryCategory}`)
      console.log(`拡張キーワード:`, expansion.expandedKeywords)
      console.log(`関連手続き:`, expansion.relatedProcedures)
      console.log(`検索クエリ:`, expansion.searchQueries)
      console.log(`===============`)
      
             // Brave Search実行（順次実行でレート制限回避）
       const searchResults: Array<{ title: string, url: string, description: string }> = []
      const braveClient = new BraveSearchClient(process.env.BRAVE_API_KEY!)
      
      // メイン検索
      try {
        const mainResults = await braveClient.search(query)
        console.log(`メイン検索結果: ${mainResults.length}件`)
        searchResults.push(...mainResults)
      } catch (error) {
        console.error('メイン検索エラー:', error)
      }
      
             // 拡張検索1（1.2秒間隔）
       if (expansion.searchQueries[0] && expansion.searchQueries[0] !== query) {
         await new Promise(resolve => setTimeout(resolve, 1200))
         try {
           const additionalResults1 = await braveClient.search(expansion.searchQueries[0])
           console.log(`追加検索1結果: ${additionalResults1.length}件`)
           searchResults.push(...additionalResults1)
         } catch (error) {
           console.error('追加検索1エラー:', error)
         }
       }
       
       // 拡張検索2（1.2秒間隔）
       if (expansion.searchQueries[1] && expansion.searchQueries[1] !== query && expansion.searchQueries[1] !== expansion.searchQueries[0]) {
         await new Promise(resolve => setTimeout(resolve, 1200))
         try {
           const additionalResults2 = await braveClient.search(expansion.searchQueries[1])
           console.log(`追加検索2結果: ${additionalResults2.length}件`)
           searchResults.push(...additionalResults2)
         } catch (error) {
           console.error('追加検索2エラー:', error)
         }
       }
      
      console.log(`Search results for "${query}":`, searchResults.length)

      // Gemini決定木生成（強化版）
      const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY!)
      let tree
      
      try {
        tree = await geminiClient.generateDecisionTree(searchResults, query)
        console.log('決定木生成: Gemini成功')
             } catch (error) {
         console.error('Enhanced Gemini generation failed:', error)
         console.log(`決定木生成失敗、実検索データで代替構築: ${query} → ${expansion.industryCategory} (関連手続き: ${expansion.relatedProcedures.length}件)`)
         
         // フォールバック: 実際の検索データから手続きリストを構築
         const fallbackProcedures = expansion.relatedProcedures.map((name, index) => {
           // 検索結果から関連URLを探す
           const relatedResult = searchResults.find((result: { title: string, url: string, description: string }) => 
             result.title.includes(name) || result.description.includes(name)
           )
           
           return {
             procedure_id: `REAL-${index + 1}`,
             name,
             jurisdiction: relatedResult ? new URL(relatedResult.url).hostname.replace('www.', '') : '関連省庁',
             url: relatedResult ? relatedResult.url : 'https://www.e-gov.go.jp/',
             requirements: relatedResult ? relatedResult.description.slice(0, 100) + '...' : '申請書等の必要書類',
             deadline: '期限については公式サイトをご確認ください',
             fee: '手数料については公式サイトをご確認ください'
           }
         })
         
         const fallbackTree: DecisionTree = {
           question: `${expansion.industryCategory}に関連する手続きをご確認ください`,
           key: 'root',
           options: ['手続き一覧を表示'],
           children: [{
             procedureList: fallbackProcedures
           }]
         }
         tree = fallbackTree
       }
      
      // 決定木の構造を検証・修正
      const validationResult = validateAndFixDecisionTree(tree)
      if (!validationResult.isValid) {
        console.warn('Decision tree validation issues:', validationResult.errors)
        if (validationResult.fixes.length > 0) {
          console.warn('Applied fixes:', validationResult.fixes)
        }
      }
      
      // 修正済みの決定木を使用
      const fixedTree = validationResult.tree

      // 4. 最初の質問を返す
      return NextResponse.json({
        mode: 'question',
        question: ('question' in fixedTree) ? fixedTree.question : '選択してください',
        key: ('key' in fixedTree) ? fixedTree.key : 'root',
        options: ('options' in fixedTree) ? fixedTree.options : ['続行'],
        currentPath: [],
        tree: fixedTree, // Include the fixed tree
        expandedKeywords: [query, ...expansion.expandedKeywords],
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
    
    // 決定木の構造を検証・修正
    const validationResult = validateAndFixDecisionTree(tree)
    if (!validationResult.isValid) {
      console.warn('Decision tree validation issues in answer processing:', validationResult.errors)
      if (validationResult.fixes.length > 0) {
        console.warn('Applied fixes in answer processing:', validationResult.fixes)
      }
    }
    const fixedTree = validationResult.tree
    
    // 4. 決定木を辿って次の質問または結果を返す
    const result = navigateTree(fixedTree, answers)
    
    if (result.mode === 'question') {
      return NextResponse.json({
        mode: 'question',
        question: result.question,
        key: result.key,
        options: result.options,
        currentPath: Object.keys(answers).filter(k => k !== '_originalQuery'),
        tree: fixedTree,
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
        tree: fixedTree,
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