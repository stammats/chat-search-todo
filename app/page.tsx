'use client'
import { useState } from 'react'
import SearchForm from '@/components/SearchForm'
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
}

interface FinalState {
  procedures: Procedure[]
  tree?: DecisionTree
  currentPath: string[]
}

// type ViewMode = 'question' | 'tree'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [searchStatus, setSearchStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [questionState, setQuestionState] = useState<QuestionState | null>(null)
  const [finalState, setFinalState] = useState<FinalState | null>(null)
  // const [viewMode, setViewMode] = useState<ViewMode>('question')
  const [answers, setAnswers] = useState<Record<string, string>>({})

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
        setQuestionState({
          question: data.question,
          key: data.key,
          options: data.options,
          currentPath: data.currentPath || [],
          tree: data.tree // Make sure tree is included
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
          tree: questionState.tree
        })
      } else if (result.mode === 'final') {
        setSearchStatus('必要な手続きを整理中...')
        await new Promise(resolve => setTimeout(resolve, 300))
        setFinalState({
          procedures: result.procedures!,
          tree: questionState.tree,
          currentPath: Object.keys(newAnswers)
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
      console.error(`[Depth ${depth}] No child node at index ${answerIndex}!`, {
        childrenLength: tree.children.length,
        answerIndex,
        userAnswer
      })
      // エラー時は最初の有効な子ノードを使用
      const firstValidChild = tree.children.find((child: DecisionTree | ProcedureList) => child && ('question' in child || 'procedureList' in child))
      if (firstValidChild) {
        console.warn(`[Depth ${depth}] Using first valid child instead`)
        return navigateTreeLocally(firstValidChild, answers, depth + 1)
      }
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
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {questionState.options.map((option, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start h-auto text-left p-4"
                        onClick={() => handleAnswer(option)}
                        disabled={isLoading}
                      >
                        {option}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              )}
              
              {finalState && (
                <Card>
                  <CardHeader>
                    <CardTitle>必要な手続き一覧</CardTitle>
                    <CardDescription>
                      以下の手続きが必要です
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
          </div>
        )}
      </div>
    </main>
  )
}
