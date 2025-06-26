import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function FlowSkeleton() {
  return (
    <Card>
      <CardHeader>
        {/* プログレスバー */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="w-full h-2 rounded-full" />
        </div>
        
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center space-x-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            </div>
          ))}
        </div>
        
        {/* ナビゲーションボタン */}
        <div className="flex justify-between items-center pt-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </CardContent>
    </Card>
  )
} 