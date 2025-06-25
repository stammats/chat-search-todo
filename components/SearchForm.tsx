'use client'
import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

interface SearchFormProps {
  onSearch: (query: string) => void
  isLoading?: boolean
  searchStatus?: string
}

const trendingKeywords = [
  '観光地でレンタカー業を始めたい',
  '酒造の事業承継手続き',
  'インバウンド向け民泊事業',
  'ドローン配送サービス許可',
  'キッチンカーでの食品販売',
  '地方創生での農業法人設立'
]

export default function SearchForm({ onSearch, isLoading = false, searchStatus = '' }: SearchFormProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  const handleTrendingClick = (keyword: string) => {
    setQuery(keyword)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (query.trim()) {
        onSearch(query.trim())
      }
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="relative">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="本日はどのようなお手伝いをさせていただけますか？"
          disabled={isLoading}
          className="min-h-[80px] resize-none pr-12 search-textarea"
          rows={2}
        />
        <Button
          type="submit"
          disabled={isLoading || !query.trim()}
          size="icon"
          variant="ghost"
          className="absolute bottom-2 right-2 h-8 w-8 hover:bg-transparent"
        >
          <Search className="h-5 w-5 text-muted-foreground" />
        </Button>
      </form>

      {isLoading && searchStatus && (
        <p className="text-sm text-muted-foreground animate-pulse text-center">
          {searchStatus}
        </p>
      )}

      <div className="mt-6">
        <p className="text-sm font-medium text-center mb-3 text-gray-600">よく検索される手続き</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {trendingKeywords.map((keyword, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => handleTrendingClick(keyword)}
              disabled={isLoading}
              className="text-sm h-8 px-4 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              {keyword}
            </Button>
          ))}
        </div>
      </div>
    
    </div>
  )
}