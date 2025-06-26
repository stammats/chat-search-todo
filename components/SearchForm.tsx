'use client'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

interface SearchFormProps {
  onSearch: (query: string) => void
  isLoading?: boolean
  searchStatus?: string
  isCollapsed?: boolean
}

const trendingKeywords = [
  '観光地でレンタカー業を始めたい',
  '酒造の事業承継手続き',
  'インバウンド向け民泊事業',
  'ドローン配送サービス許可',
  'キッチンカーでの食品販売',
  '地方創生での農業法人設立'
]

export default function SearchForm({ onSearch, isLoading = false, searchStatus = '', isCollapsed = false }: SearchFormProps) {
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

  return (
    <>
      {/* 検索ステータス（独立表示） */}
      {isLoading && searchStatus && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground animate-pulse text-center">
            {searchStatus}
          </p>
        </div>
      )}

      {/* 検索フォームとトレンドワード（collapse対象） */}
      <div 
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          isCollapsed 
            ? 'max-h-0 opacity-0 transform -translate-y-4' 
            : 'max-h-96 opacity-100 transform translate-y-0'
        }`}
      >
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="relative">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="本日はどのようなお手伝いをさせていただけますか？"
              disabled={isLoading}
              className="pr-12 search-input"
            />
            <Button
              type="submit"
              disabled={isLoading || !query.trim()}
              size="icon"
              variant="ghost"
              className="absolute top-1/2 right-3 -translate-y-1/2 h-10 w-10 hover:bg-transparent"
            >
              <Search className="h-6 w-6 text-muted-foreground" />
            </Button>
          </form>

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
      </div>
    </>
  )
}