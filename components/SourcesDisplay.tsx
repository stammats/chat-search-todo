import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Source {
  title: string
  url: string
  snippet: string
}

interface SourcesDisplayProps {
  sources: Source[]
  title: string
  description: string
  maxVisible?: number
  compact?: boolean
  className?: string
}

export default function SourcesDisplay({ 
  sources, 
  title, 
  description, 
  maxVisible, 
  compact = false,
  className = "" 
}: SourcesDisplayProps) {
  const visibleSources = maxVisible ? sources.slice(0, maxVisible) : sources
  const remainingCount = maxVisible && sources.length > maxVisible ? sources.length - maxVisible : 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title} {sources.length > 0 && `(${sources.length}件)`}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {sources.length > 0 ? (
          <div className="space-y-4">
            {visibleSources.map((source, index) => (
              <div 
                key={index} 
                className={`border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors ${
                  compact ? 'border-b border-gray-100 pb-3 last:border-b-0 border-none rounded-none p-0 bg-transparent hover:bg-transparent' : ''
                }`}
              >
                <h4 className={`font-medium mb-2 ${compact ? 'text-sm mb-1' : 'text-base'}`}>
                  <a 
                    href={source.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {source.title}
                  </a>
                </h4>
                <p className={`text-green-600 font-mono mb-2 ${compact ? 'text-xs mb-1' : 'text-sm'}`}>
                  {source.url}
                </p>
                <p className={`text-gray-700 leading-relaxed ${compact ? 'text-xs line-clamp-1' : 'text-sm'}`}>
                  {source.snippet}
                </p>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="text-xs text-gray-500 text-center pt-2">
                他 {remainingCount} 件のソースあり（最終結果で全て表示されます）
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              この検索では外部ソース情報が利用できませんが、手続き情報は内部データベースから生成されています。
            </p>
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-xs text-yellow-800">
                  <strong>開発者向け情報:</strong> sources配列: {JSON.stringify(sources)}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 