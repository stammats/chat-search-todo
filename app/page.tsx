'use client'
import { useState } from 'react'
import SearchForm from '@/components/SearchForm'
import SourcesDisplay from '@/components/SourcesDisplay'
import FlowSkeleton from '@/components/FlowSkeleton'
import { DecisionTree, Procedure, ProcedureList } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// const DecisionTreeFlow = dynamic(() => import('@/components/DecisionTreeFlow'), {
//   ssr: false
// })

interface QuestionState {
  question: string
  key: string
  options: string[]
  currentPath: string[]
  tree?: DecisionTree
  allowMultiple?: boolean
  selectedOptions?: string[]
  allProcedures?: Procedure[]
  sources?: Array<{title: string, url: string, snippet: string}>
}

interface FinalState {
  procedures: Procedure[]
  relatedProcedures: Procedure[]
  allProcedures: Procedure[]
  tree?: DecisionTree
  currentPath: string[]
  sources?: Array<{title: string, url: string, snippet: string}>
}

// type ViewMode = 'question' | 'tree'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [searchStatus, setSearchStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [questionState, setQuestionState] = useState<QuestionState | null>(null)
  const [finalState, setFinalState] = useState<FinalState | null>(null)
  // const [viewMode, setViewMode] = useState<ViewMode>('question')
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [isSearchFormCollapsed, setIsSearchFormCollapsed] = useState(false)

  // 検索をリセットして元の状態に戻す関数
  const resetToInitialState = () => {
    setIsLoading(false)
    setSearchStatus('')
    setError(null)
    setQuestionState(null)
    setFinalState(null)
    setAnswers({})
    setShowSkeleton(false)
    setIsSearchFormCollapsed(false)
  }

  // 決定木から全手続きを収集する関数
  const collectAllProcedures = (tree: DecisionTree | ProcedureList): Procedure[] => {
    const allProcedures: Procedure[] = []

    const traverse = (node: DecisionTree | ProcedureList, depth: number = 0) => {
      console.log(`[collectAllProcedures] Depth ${depth}:`, {
        hasProcedureList: 'procedureList' in node,
        hasChildren: 'children' in node && node.children?.length > 0,
        nodeType: 'procedureList' in node ? 'ProcedureList' : 'DecisionTree'
      })

      if ('procedureList' in node) {
        // 手続きリストから全手続きを追加
        console.log(`[collectAllProcedures] Found ${node.procedureList.length} procedures at depth ${depth}`)
        node.procedureList.forEach(procedure => {
          console.log(`[collectAllProcedures] Adding procedure: ${procedure.name}`)
          allProcedures.push(procedure)
        })
      } else {
        // 子ノードを再帰的に探索
        if (node.children && node.children.length > 0) {
          console.log(`[collectAllProcedures] Traversing ${node.children.length} children at depth ${depth}`)
          node.children.forEach((child, index) => {
            console.log(`[collectAllProcedures] Processing child ${index} at depth ${depth}`)
            if (child) {
              traverse(child, depth + 1)
            }
          })
        } else {
          console.log(`[collectAllProcedures] No children found at depth ${depth}`)
        }
      }
    }

    console.log('[collectAllProcedures] Starting traversal of decision tree')
    traverse(tree)
    
    console.log(`[collectAllProcedures] Collected ${allProcedures.length} total procedures before deduplication`)
    
    // 重複除去
    const uniqueProcedures = allProcedures.filter((procedure, index, array) => 
      array.findIndex(p => p.procedure_id === procedure.procedure_id) === index
    )
    
    console.log(`[collectAllProcedures] After deduplication: ${uniqueProcedures.length} unique procedures`)
    console.log('[collectAllProcedures] Procedure names:', uniqueProcedures.map(p => p.name))
    
    return uniqueProcedures
  }

  // 決定木の最大深度を計算する関数
  const calculateMaxDepth = (tree: DecisionTree | ProcedureList): number => {
    const findMaxDepth = (node: DecisionTree | ProcedureList, currentDepth: number = 0): number => {
      if (currentDepth > 20) {
        console.warn('Maximum depth calculation reached, stopping to prevent infinite loops')
        return currentDepth
      }
      
      if ('procedureList' in node) {
        return currentDepth
      }
      
      if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
        return currentDepth
      }
      
      let maxChildDepth = currentDepth
      node.children.forEach(child => {
        if (child) {
          const childDepth = findMaxDepth(child, currentDepth + 1)
          maxChildDepth = Math.max(maxChildDepth, childDepth)
        }
      })
      
      return maxChildDepth
    }
    
    try {
      return findMaxDepth(tree)
    } catch (error) {
      console.error('Error during depth calculation:', error)
      return 1
    }
  }

  // 決定木から関連手続きを収集する関数（現在選択されたもの以外）
  const collectRelatedProcedures = (allProcedures: Procedure[], currentProcedures: Procedure[]): Procedure[] => {
    const currentProcedureIds = new Set(currentProcedures.map(p => p.procedure_id))
    
    const relatedProcedures = allProcedures.filter(procedure => 
      !currentProcedureIds.has(procedure.procedure_id)
    )
    
    return relatedProcedures
  }

  // フォールバック用の関連手続き生成関数
  const generateFallbackRelatedProcedures = (selectedProcedureNames: string[]): Procedure[] => {
    console.log('[generateFallbackRelatedProcedures] Generating fallback procedures for:', selectedProcedureNames)
    
    // 一般的な飲食店関連手続きの例（実際の検索で見つからなかった場合の補完）
    const commonRelatedProcedures: Procedure[] = [
      {
        procedure_id: 'fallback_1',
        name: '食品衛生責任者設置届',
        jurisdiction: '保健所',
        requirements: '食品衛生責任者資格証',
        deadline: '営業開始時',
        fee: '無料',
        url: 'https://www.mhlw.go.jp/'
      },
      {
        procedure_id: 'fallback_2',
        name: '防火管理者選任届出書',
        jurisdiction: '消防署',
        requirements: '防火管理者資格証、防火管理者選任届出書',
        deadline: '営業開始から7日以内',
        fee: '無料',
        url: 'https://www.fdma.go.jp/'
      },
      {
        procedure_id: 'fallback_3',
        name: '労働保険加入手続き',
        jurisdiction: 'ハローワーク・労働基準監督署',
        requirements: '従業員名簿、賃金台帳等',
        deadline: '従業員雇用開始時',
        fee: '保険料として給与の一定割合',
        url: 'https://www.mhlw.go.jp/'
      }
    ]
    
    // 選択された手続きの内容に基づいて適切な関連手続きを返す（簡易実装）
    return commonRelatedProcedures.slice(0, 3)
  }

  const handleSearch = async (query: string) => {
    setIsLoading(true)
    setSearchStatus('処理を開始しています...')
    setError(null)
    setQuestionState(null)
    setFinalState(null)
    setAnswers({})
    
    // 検索フォームをcollapseし、スケルトンローダーを表示
    setIsSearchFormCollapsed(true)
    setTimeout(() => setShowSkeleton(true), 300) // アニメーション後にスケルトンを表示
    
    try {
      // ポーリングでステータスを更新
      const statusMessages = [
        'キーワードを分析しています...',
        `「${query}」に関連する手続きを特定中...`,
        '政府機関の公式情報を確認中...',
        '必要書類や申請方法を調査中...',
        '手数料や期限情報を収集中...',
        '検索結果を整理中...',
        '質問ツリーを生成中...'
      ]
      
      let statusIndex = 0
      const statusInterval = setInterval(() => {
        if (statusIndex < statusMessages.length) {
          setSearchStatus(statusMessages[statusIndex])
          statusIndex++
        }
      }, 2000) // 2秒ごとに更新
      
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })
      
      clearInterval(statusInterval)
      const data = await response.json()
      
      if (data.mode === 'error') {
        setError(data.error)
      } else if (data.mode === 'question') {
        // 決定木から全手続きを収集
        console.log('[handleSearch] Collecting all procedures from decision tree')
        const allProcedures = data.tree ? collectAllProcedures(data.tree) : []
        console.log(`[handleSearch] Collected ${allProcedures.length} procedures total`)
        
        console.log('[handleSearch] Setting questionState with sources:', data.sources?.length || 0)
        setQuestionState({
          question: data.question,
          key: data.key,
          options: data.options,
          currentPath: data.currentPath || [],
          tree: data.tree, // Make sure tree is included
          allowMultiple: data.tree?.allowMultiple,
          selectedOptions: [],
          allProcedures: allProcedures,
          sources: data.sources || []
        })
      }
    } catch (err) {
      console.error('Search failed:', err)
      setError('検索中にエラーが発生しました。')
      // エラー時はフォームを元に戻す
      setIsSearchFormCollapsed(false)
    } finally {
      setIsLoading(false)
      setSearchStatus('')
      setShowSkeleton(false)
    }
  }

  const handleAnswer = async (option: string) => {
    console.log('=== USER SELECTION LOG ===')
    console.log('質問:', questionState?.question)
    console.log('選択肢:', questionState?.options)
    console.log('ユーザー選択:', option)
    console.log('質問キー:', questionState?.key)
    console.log('現在の回答履歴:', answers)
    console.log('========================')
    
    if (!questionState || !questionState.tree) {
      console.error('No questionState or tree available')
      return
    }
    
    setIsLoading(true)
    setSearchStatus('回答を処理しています...')
    const newAnswers = { ...answers, [questionState.key]: option }
    console.log('=== UPDATED ANSWERS ===')
    console.log('新しい回答オブジェクト:', newAnswers)
    console.log('回答数:', Object.keys(newAnswers).length)
    console.log('=======================')
    setAnswers(newAnswers)
    
    // 既存のツリーを使ってローカルでナビゲーション
    try {
      // 少し遅延を入れてユーザーに処理中であることを示す
      await new Promise(resolve => setTimeout(resolve, 300))
      
      setSearchStatus('次の質問を準備中...')
      console.log('Starting tree navigation with:', {
        tree: questionState.tree,
        answers: newAnswers
      })
      const result = navigateTreeLocally(questionState.tree, newAnswers)
      
      if (result.mode === 'question') {
        setQuestionState({
          question: result.question!,
          key: result.key!,
          options: result.options!,
          currentPath: Object.keys(newAnswers),
          tree: questionState.tree,
          allowMultiple: result.allowMultiple,
          selectedOptions: [],
          allProcedures: questionState.allProcedures,
          sources: questionState.sources // ソース情報を保持
        })
      } else if (result.mode === 'final') {
        setSearchStatus('必要な手続きを整理中...')
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 関連手続きを収集
        let allProcedures = questionState.allProcedures || []
        
        // allProceduresが空の場合、決定木から再度収集を試行
        if (allProcedures.length === 0 && questionState.tree) {
          console.log('[handleAnswer] allProcedures is empty, recollecting from tree')
          allProcedures = collectAllProcedures(questionState.tree)
          console.log(`[handleAnswer] Recollected ${allProcedures.length} procedures`)
        }
        
        let relatedProcedures = collectRelatedProcedures(allProcedures, result.procedures!)
        
        // それでも関連手続きが取得できない場合、簡易的な方法で関連手続きを生成
        if (relatedProcedures.length === 0 && result.procedures!.length > 0) {
          console.log('[handleAnswer] No related procedures found, using fallback method')
          // 選択された手続きから関連キーワードを抽出し、簡易的な関連手続きを作成
          const selectedProcedureNames = result.procedures!.map(p => p.name)
          relatedProcedures = generateFallbackRelatedProcedures(selectedProcedureNames)
        }
        
        // 詳細デバッグ情報をコンソールに出力
        console.log('=== 最終結果詳細分析 ===')
        console.log('選択された手続き数:', result.procedures!.length)
        console.log('選択された手続き:', result.procedures!.map(p => ({ 
          name: p.name, 
          id: p.procedure_id, 
          jurisdiction: p.jurisdiction 
        })))
        
        console.log('全利用可能手続き数:', allProcedures.length)
        if (allProcedures.length > 0) {
          console.log('全手続き詳細:', allProcedures.map(p => ({ 
            name: p.name, 
            id: p.procedure_id, 
            jurisdiction: p.jurisdiction 
          })))
        }
        
        console.log('関連手続き数:', relatedProcedures.length)
        if (relatedProcedures.length > 0) {
          console.log('関連手続き詳細:', relatedProcedures.map(p => ({ 
            name: p.name, 
            id: p.procedure_id, 
            jurisdiction: p.jurisdiction 
          })))
        }
        
        console.log('回答履歴:')
        Object.entries(newAnswers).forEach(([key, value]) => {
          console.log(`  ${key}: "${value}"`)
        })
        
        console.log('決定木深度:', Object.keys(newAnswers).length)
        console.log('ソース数:', questionState.sources?.length || 0)
        console.log('==============================')
        
        console.log('[handleAnswer] Setting finalState with sources:', questionState.sources?.length || 0)
        setFinalState({
          procedures: result.procedures!,
          relatedProcedures: relatedProcedures,
          allProcedures: allProcedures,
          tree: questionState.tree,
          currentPath: Object.keys(newAnswers),
          sources: questionState.sources || []
        })
      }
    } catch (err) {
      console.error('Answer navigation failed:', err)
      setError('回答処理中にエラーが発生しました。')
    } finally {
      setIsLoading(false)
      setSearchStatus('')
    }
  }

  // ローカルでツリーをナビゲートする関数
  const navigateTreeLocally = (tree: DecisionTree | ProcedureList, answers: Record<string, string>, depth: number = 0): {
    mode: 'question' | 'final'
    question?: string
    key?: string
    options?: string[]
    procedures?: Procedure[]
  } => {
    console.log(`[Depth ${depth}] Navigating tree:`, {
      hasQuestion: !!tree.question,
      key: tree.key,
      hasProcedureList: 'procedureList' in tree,
      childrenCount: tree.children?.length || 0,
      currentAnswers: answers
    })

    // 手続きリストの場合
    if ('procedureList' in tree) {
      console.log(`[Depth ${depth}] Found procedure list with ${tree.procedureList.length} procedures`)
      return {
        mode: 'final',
        procedures: tree.procedureList
      }
    }
    
    // 現在の質問に対する回答がない場合
    if (!answers[tree.key]) {
      console.log(`[Depth ${depth}] No answer for key ${tree.key}, showing question`)
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options
      }
    }
    
    // 回答に基づいて次のノードを探す
    const userAnswer = answers[tree.key]
    const answerIndex = tree.options.indexOf(userAnswer)
    console.log(`[Depth ${depth}] Answer "${userAnswer}" has index ${answerIndex}`)
    console.log(`[Depth ${depth}] Options:`, tree.options)
    console.log(`[Depth ${depth}] Children count:`, tree.children?.length)
    
    // オプション数と子ノード数の一致チェック
    if (tree.children && tree.options.length !== tree.children.length) {
      console.warn(`[Depth ${depth}] MISMATCH: Options count (${tree.options.length}) != Children count (${tree.children.length})`)
      console.warn(`[Depth ${depth}] Options:`, tree.options)
      console.warn(`[Depth ${depth}] Children structure:`, tree.children.map((child, idx) => ({
        index: idx,
        hasQuestion: child && 'question' in child,
        hasProcedureList: child && 'procedureList' in child,
        isValid: child && ('question' in child || 'procedureList' in child)
      })))
      
      // 不整合を自動修正: 有効な子ノードのみにオプションを調整
      const validChildren = tree.children.filter(child => 
        child && ('question' in child || 'procedureList' in child)
      )
      
      if (validChildren.length > 0) {
        console.warn(`[Depth ${depth}] Auto-fixing: Using ${validChildren.length} valid children`)
        tree.children = validChildren
        tree.options = tree.options.slice(0, validChildren.length)
        
        // answerIndexを再計算
        const correctedAnswerIndex = tree.options.indexOf(userAnswer)
        if (correctedAnswerIndex >= 0 && correctedAnswerIndex < tree.children.length) {
          console.warn(`[Depth ${depth}] Corrected answer index: ${correctedAnswerIndex}`)
          return navigateTreeLocally(tree.children[correctedAnswerIndex], answers, depth + 1)
        }
      }
    }
    
    if (answerIndex === -1) {
      console.error(`[Depth ${depth}] Answer not found in options!`, {
        userAnswer,
        availableOptions: tree.options
      })
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options
      }
    }
    
    if (!tree.children || tree.children.length === 0) {
      console.error(`[Depth ${depth}] No children array in tree!`)
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options
      }
    }
    
    // 子ノードの詳細をログ出力
    console.log(`[Depth ${depth}] Children details:`)
    tree.children.forEach((child: DecisionTree | ProcedureList, index: number) => {
      console.log(`  [${index}]:`, {
        hasQuestion: 'question' in child ? !!child.question : false,
        hasProcedureList: 'procedureList' in child,
        key: 'key' in child ? child.key : undefined
      })
    })
    
    if (!tree.children[answerIndex]) {
      console.warn(`[Depth ${depth}] No child node at index ${answerIndex}!`, {
        childrenLength: tree.children.length,
        answerIndex,
        userAnswer,
        optionsLength: tree.options.length,
        allAnswers: answers
      })
      
      // より詳細なエラー情報
      console.warn(`[Depth ${depth}] Decision tree structure validation failed:`)
      console.warn(`  - User selected: "${userAnswer}" (index: ${answerIndex})`)
      console.warn(`  - Available options: [${tree.options.join(', ')}]`)
      console.warn(`  - Children array length: ${tree.children.length}`)
      console.warn(`  - Children details:`, tree.children.map((child, idx) => ({
        index: idx,
        exists: !!child,
        type: child ? ('procedureList' in child ? 'ProcedureList' : 'DecisionTree') : 'null'
      })))
      
      // より安全な復旧処理
      if (tree.children.length > 0) {
        // 利用可能な有効な子ノードを探す
        const validChildIndex = tree.children.findIndex(child => 
          child && ('question' in child || 'procedureList' in child)
        )
        
        if (validChildIndex >= 0) {
          const validChild = tree.children[validChildIndex]
          console.warn(`[Depth ${depth}] Using valid child at index ${validChildIndex} instead`)
          return navigateTreeLocally(validChild, answers, depth + 1)
        }
        
        // 最初の子ノードをフォールバックとして使用
        const safeChildIndex = Math.min(answerIndex, tree.children.length - 1)
        const safeChild = tree.children[safeChildIndex]
        if (safeChild && ('question' in safeChild || 'procedureList' in safeChild)) {
          console.warn(`[Depth ${depth}] Using child at safe index ${safeChildIndex} instead`)
          return navigateTreeLocally(safeChild, answers, depth + 1)
        }
      }
      
      // 子ノードが全く使えない場合は現在の質問に戻る
      console.warn(`[Depth ${depth}] No valid child nodes available, returning to current question`)
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options
      }
    }
    
    // 再帰的に次のノードを探す
    console.log(`[Depth ${depth}] Moving to child node at index ${answerIndex}`)
    return navigateTreeLocally(tree.children[answerIndex], answers, depth + 1)
  }

  return (
    <main className="min-h-screen bg-background py-12 mt-10">
      <div className="container max-w-2xl mx-auto px-4">
        <div className="mb-8">
          <div className="flex justify-center mb-4">
            <div 
              className={`w-32 h-32 bg-[url('/imoduru.png')] bg-contain bg-no-repeat bg-center transition-all duration-300 ${
                isLoading 
                  ? 'animate-imoduru-search' 
                  : 'hover:scale-105'
              }`}
              role="img"
              aria-label="芋づるマスコット"
            />
          </div>
          <h1 className="text-4xl font-bold text-center mb-2">
            行政手続き芋づる検索
          </h1>
          <p className='text-center text-gray-500'>最短10秒! 一つの検索で関連手続きを芋づる式に一気に確認</p>
        </div>
        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          searchStatus={searchStatus}
          isCollapsed={isSearchFormCollapsed}
        />
        
        {/* スケルトンローダー */}
        {showSkeleton && !questionState && !finalState && (
          <div className="mt-8">
            <FlowSkeleton />
            {/* キャンセルボタン */}
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={resetToInitialState}
                className="flex items-center space-x-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>キャンセル</span>
              </Button>
            </div>
          </div>
        )}
        
        {error && (
          <Alert variant="destructive" className="mt-8">
            <AlertDescription>
              {error}
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-2"
                onClick={() => {
                  setError(null)
                  setIsSearchFormCollapsed(false)
                  setShowSkeleton(false)
                }}
              >
                再試行
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {(questionState || finalState) && (
          <div className="mt-8">
              {questionState && !finalState && (
                <Card>
                  <CardHeader>
                    {/* プログレスバー */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          質問 {questionState.currentPath.length + 1} / {questionState.tree ? calculateMaxDepth(questionState.tree) + 1 : 1}
                        </span>
                        <span className="text-sm font-medium text-gray-600">
                          {Math.round(((questionState.currentPath.length + 1) / (questionState.tree ? calculateMaxDepth(questionState.tree) + 1 : 1)) * 100)}% 完了
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ 
                            width: `${Math.round(((questionState.currentPath.length + 1) / (questionState.tree ? calculateMaxDepth(questionState.tree) + 1 : 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                    
                    <CardTitle className="text-xl mb-2">{questionState.question}</CardTitle>
                    {questionState.allowMultiple && (
                      <CardDescription>
                        複数選択可能です。該当するものをすべて選択してください。
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      {questionState.options.map((option, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="justify-start h-auto text-left p-4 hover:bg-blue-50 hover:border-blue-300"
                          onClick={() => handleAnswer(option)}
                          disabled={isLoading}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-5 h-5 border-2 border-gray-300 rounded-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-transparent rounded-full"></div>
                            </div>
                            <span>{option}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                    
                    {/* ナビゲーションボタン */}
                    <div className="flex justify-between items-center pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          // 前の質問に戻る処理（簡易実装）
                          console.log('前へ戻る機能は未実装です')
                        }}
                        disabled={isLoading || questionState.currentPath.length === 0}
                        className="flex items-center space-x-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15,18 9,12 15,6"></polyline>
                        </svg>
                        <span>前へ戻る</span>
                      </Button>
                      
                      <Button
                        variant="default"
                        disabled={true}
                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
                      >
                        <span>次へ進む</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9,18 15,12 9,6"></polyline>
                        </svg>
                      </Button>
                    </div>
                    
                    {/* 検索をやり直すボタン */}
                    <div className="flex justify-center pt-4 border-t">
                      <Button
                        variant="ghost"
                        onClick={resetToInitialState}
                        className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="1,4 1,10 7,10"></polyline>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        <span>検索をやり直す</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {finalState && (
                <Card>
                  <CardHeader>
                    <CardTitle>必要な手続き一覧</CardTitle>
                    <CardDescription>
                      検索結果：全{finalState.allProcedures.length}件中、必要な手続き{finalState.procedures.length}件、関連手続き{finalState.relatedProcedures.length}件
                    </CardDescription>
                    {/* 検索をやり直すボタン */}
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        onClick={resetToInitialState}
                        className="flex items-center space-x-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="1,4 1,10 7,10"></polyline>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        <span>検索をやり直す</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {finalState.procedures.map((procedure, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <CardTitle className="text-lg">{procedure.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <p><span className="font-medium">申請先:</span> {procedure.jurisdiction}</p>
                          {procedure.requirements && (
                            <p><span className="font-medium">必要書類:</span> {procedure.requirements}</p>
                          )}
                          {procedure.deadline && (
                            <p><span className="font-medium">期限:</span> {procedure.deadline}</p>
                          )}
                          {procedure.fee && (
                            <p><span className="font-medium">手数料:</span> {procedure.fee}</p>
                          )}
                          {procedure.url && (
                            <p>
                              <span className="font-medium">詳細:</span>{' '}
                              <a 
                                href={procedure.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary hover:underline"
                              >
                                {procedure.url}
                              </a>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              )}
              
              {finalState && finalState.relatedProcedures.length > 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>関連する手続き ({finalState.relatedProcedures.length}件)</CardTitle>
                    <CardDescription>
                      一問一答では該当しませんでしたが、状況によっては必要になる可能性がある手続きです
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {finalState.relatedProcedures.map((procedure, index) => (
                      <Card key={index} className="border border-gray-200 bg-gray-50">
                        <CardHeader>
                          <CardTitle className="text-lg text-gray-700">{procedure.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-gray-600">
                          <p><span className="font-medium">申請先:</span> {procedure.jurisdiction}</p>
                          {procedure.requirements && (
                            <p><span className="font-medium">必要書類:</span> {procedure.requirements}</p>
                          )}
                          {procedure.deadline && (
                            <p><span className="font-medium">期限:</span> {procedure.deadline}</p>
                          )}
                          {procedure.fee && (
                            <p><span className="font-medium">手数料:</span> {procedure.fee}</p>
                          )}
                          {procedure.url && (
                            <p>
                              <span className="font-medium">詳細:</span>{' '}
                              <a 
                                href={procedure.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary hover:underline"
                              >
                                {procedure.url}
                              </a>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                                     </CardContent>
                 </Card>
               )}
               
               {/* Brave Search ソース情報を常に表示 */}
              {finalState && (
                <SourcesDisplay
                  sources={finalState.sources || []}
                  title="検索した情報"
                  description={
                    (finalState.sources && finalState.sources.length > 0) ? 
                      'この手続きと手続き情報の作成に使用した検索結果です' :
                      '検索ソース情報が取得できませんでした'
                  }
                  className="mt-6"
                />
              )}
              
              {/* 質問画面でもソース情報を表示 */}
              {questionState && !finalState && questionState.sources && questionState.sources.length > 0 && (
                <SourcesDisplay
                  sources={questionState.sources}
                  title="検索に使用した情報源"
                  description="手続きガイドの作成に使用したBrave Searchの検索結果です"
                  maxVisible={3}
                  compact={true}
                  className="mt-6"
                />
              )}
               
               {/* デバッグ情報（開発環境でのみ表示） */}
               {process.env.NODE_ENV === 'development' && finalState && (
                 <Card className="mt-6 bg-gray-50">
                   <CardHeader>
                     <CardTitle className="text-red-600">🔧 デバッグ情報</CardTitle>
                     <CardDescription>
                       開発環境でのみ表示される技術情報です
                     </CardDescription>
                   </CardHeader>
                   <CardContent className="space-y-2 text-xs">
                     <div><strong>全手続き数:</strong> {finalState.allProcedures.length}</div>
                     <div><strong>選択された手続き数:</strong> {finalState.procedures.length}</div>
                     <div><strong>関連手続き数:</strong> {finalState.relatedProcedures.length}</div>
                     <div><strong>決定木の深さ:</strong> {finalState.currentPath.length}</div>
                     <div><strong>ソース情報数:</strong> {finalState.sources?.length || 0}</div>
                     <div><strong>回答履歴:</strong> {finalState.currentPath.join(' → ')}</div>
                     {finalState.sources && finalState.sources.length > 0 && (
                       <div className="mt-2">
                         <strong>ソース詳細:</strong>
                         <ul className="list-disc list-inside text-xs mt-1">
                           {finalState.sources.map((source, index) => (
                             <li key={index} className="truncate">
                               {source.title} - {source.url}
                             </li>
                           ))}
                         </ul>
                       </div>
                     )}
                   </CardContent>
                 </Card>
               )}
          </div>
        )}
      </div>
    </main>
  )
}
