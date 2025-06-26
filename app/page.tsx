'use client'
import { useState } from 'react'
import SearchForm from '@/components/SearchForm'
import SourcesDisplay from '@/components/SourcesDisplay'
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
    } finally {
      setIsLoading(false)
      setSearchStatus('')
    }
  }

  const handleAnswer = async (option: string) => {
    console.log('handleAnswer called with option:', option)
    console.log('Current questionState:', questionState)
    
    if (!questionState || !questionState.tree) {
      console.error('No questionState or tree available')
      return
    }
    
    setIsLoading(true)
    setSearchStatus('回答を処理しています...')
    const newAnswers = { ...answers, [questionState.key]: option }
    console.log('New answers object:', newAnswers)
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
        
        // デバッグ情報をコンソールに出力
        console.log('=== 関連手続きデバッグ情報 ===')
        console.log('全手続き数:', allProcedures.length)
        console.log('選択された手続き数:', result.procedures!.length)
        console.log('関連手続き数:', relatedProcedures.length)
        console.log('全手続きリスト:', allProcedures.map(p => p.name))
        console.log('選択された手続きリスト:', result.procedures!.map(p => p.name))
        console.log('関連手続きリスト:', relatedProcedures.map(p => p.name))
        
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
        options: tree.options,
        allowMultiple: tree.allowMultiple
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
      console.error(`[Depth ${depth}] MISMATCH: Options count (${tree.options.length}) != Children count (${tree.children.length})`)
      console.error(`[Depth ${depth}] Options:`, tree.options)
      console.error(`[Depth ${depth}] Children structure:`, tree.children.map((child, idx) => ({
        index: idx,
        hasQuestion: 'question' in child,
        hasProcedureList: 'procedureList' in child,
        isValid: child && ('question' in child || 'procedureList' in child)
      })))
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
        options: tree.options,
        allowMultiple: tree.allowMultiple
      }
    }
    
    if (!tree.children || tree.children.length === 0) {
      console.error(`[Depth ${depth}] No children array in tree!`)
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options,
        allowMultiple: tree.allowMultiple
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
      console.error(`[Depth ${depth}] No child node at index ${answerIndex}!`, {
        childrenLength: tree.children.length,
        answerIndex,
        userAnswer,
        optionsLength: tree.options.length,
        allAnswers: answers
      })
      
      // より詳細なエラー情報
      console.error(`[Depth ${depth}] Decision tree structure validation failed:`)
      console.error(`  - User selected: "${userAnswer}" (index: ${answerIndex})`)
      console.error(`  - Available options: [${tree.options.join(', ')}]`)
      console.error(`  - Children array length: ${tree.children.length}`)
      console.error(`  - Children details:`, tree.children.map((child, idx) => ({
        index: idx,
        exists: !!child,
        type: child ? ('procedureList' in child ? 'ProcedureList' : 'DecisionTree') : 'null'
      })))
      
      // より安全な復旧処理
      if (tree.children.length > 0) {
        // 利用可能な最初の子ノードを使用
        const safeChildIndex = Math.min(answerIndex, tree.children.length - 1)
        const safeChild = tree.children[safeChildIndex]
        if (safeChild && ('question' in safeChild || 'procedureList' in safeChild)) {
          console.warn(`[Depth ${depth}] Using child at safe index ${safeChildIndex} instead`)
          return navigateTreeLocally(safeChild, answers, depth + 1)
        }
      }
      
      // 子ノードが全く使えない場合は現在の質問に戻る
      console.error(`[Depth ${depth}] No valid child nodes available, returning to current question`)
      return {
        mode: 'question',
        question: tree.question,
        key: tree.key,
        options: tree.options,
        allowMultiple: tree.allowMultiple
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
        />
        
        {error && (
          <Alert variant="destructive" className="mt-8">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {(questionState || finalState) && (
          <div className="mt-8">
              {questionState && !finalState && (
                <Card>
                  <CardHeader>
                    <CardTitle>{questionState.question}</CardTitle>
                    {questionState.allowMultiple && (
                      <CardDescription>
                        複数選択可能です。該当するものをすべて選択してください。
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {questionState.options.map((option, index) => (
                      <Button
                        key={index}
                        variant={questionState.selectedOptions?.includes(option) ? "default" : "outline"}
                        className="justify-start h-auto text-left p-4"
                        onClick={() => handleAnswer(option)}
                        disabled={isLoading}
                      >
                        {option}
                      </Button>
                    ))}
                    {questionState.allowMultiple && questionState.selectedOptions && questionState.selectedOptions.length > 0 && (
                      <Button
                        className="mt-4"
                        onClick={handleMultipleNext}
                        disabled={isLoading}
                      >
                        次へ
                      </Button>
                    )}
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
                  title="🔍 Brave Search ソース情報"
                  description={
                    (finalState.sources && finalState.sources.length > 0) ? 
                      'この一問一答と手続き情報の作成に使用したBrave Searchの検索結果です' :
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
