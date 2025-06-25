import { NextResponse } from 'next/server'
import { progressiveCache } from '@/lib/progressive-cache'

export async function GET() {
  const stats = progressiveCache.getStats()
  const hitRate = progressiveCache.getHitRate()
  
  return NextResponse.json({
    stats,
    hitRate,
    performance: {
      memoryHitRate: `${hitRate.memory.toFixed(2)}%`,
      redisHitRate: `${hitRate.redis.toFixed(2)}%`,
      overallHitRate: `${hitRate.overall.toFixed(2)}%`
    }
  })
}