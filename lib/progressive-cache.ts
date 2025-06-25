import { SimpleMemoryCache } from './simple-cache'

interface CacheStats {
  memoryHits: number
  memoryMisses: number
  redisHits: number
  redisMisses: number
  totalRequests: number
  redisConnected: boolean
}

interface RedisClient {
  ping: () => Promise<string>
  setex: (key: string, seconds: number, value: string) => Promise<unknown>
  get: (key: string) => Promise<string | null>
  flushdb: () => Promise<unknown>
}

export class ProgressiveCache {
  private memoryCache: SimpleMemoryCache
  private redis: RedisClient | null = null
  private redisConnected = false
  private stats: CacheStats = {
    memoryHits: 0,
    memoryMisses: 0,
    redisHits: 0,
    redisMisses: 0,
    totalRequests: 0,
    redisConnected: false
  }

  constructor() {
    this.memoryCache = new SimpleMemoryCache()
    this.tryConnectRedis() // バックグラウンドで接続試行
  }

  private async tryConnectRedis() {
    try {
      if (!process.env.REDIS_URL) {
        console.log('⚠️ Redis URL not configured, using memory cache only')
        return
      }

      const { Redis } = await import('@upstash/redis')
      this.redis = new Redis({
        url: process.env.REDIS_URL,
        token: process.env.REDIS_TOKEN || ''
      })
      
      await this.redis.ping()
      this.redisConnected = true
      this.stats.redisConnected = true
      console.log('✅ Redis connected as performance enhancement')
    } catch (error) {
      console.log('⚠️ Redis unavailable, memory cache continues working:', error)
      this.redis = null
      this.redisConnected = false
      this.stats.redisConnected = false
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    // Always set in memory cache
    this.memoryCache.set(key, value, ttlSeconds)

    // Try to set in Redis if connected
    if (this.redisConnected && this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
      } catch (error) {
        console.error('Redis set error:', error)
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    this.stats.totalRequests++

    // Try memory cache first
    const memoryResult = this.memoryCache.get<T>(key)
    if (memoryResult !== null) {
      this.stats.memoryHits++
      return memoryResult
    }
    this.stats.memoryMisses++

    // Try Redis if connected
    if (this.redisConnected && this.redis) {
      try {
        const redisResult = await this.redis.get(key)
        if (redisResult) {
          this.stats.redisHits++
          const parsed = JSON.parse(redisResult)
          // Populate memory cache for next time
          this.memoryCache.set(key, parsed, 3600)
          return parsed as T
        }
        this.stats.redisMisses++
      } catch (error) {
        console.error('Redis get error:', error)
      }
    }

    return null
  }

  async clear(): Promise<void> {
    this.memoryCache.clear()
    
    if (this.redisConnected && this.redis) {
      try {
        await this.redis.flushdb()
      } catch (error) {
        console.error('Redis clear error:', error)
      }
    }
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }

  getHitRate(): {
    memory: number
    redis: number
    overall: number
  } {
    const memoryTotal = this.stats.memoryHits + this.stats.memoryMisses
    const redisTotal = this.stats.redisHits + this.stats.redisMisses
    
    return {
      memory: memoryTotal > 0 ? (this.stats.memoryHits / memoryTotal) * 100 : 0,
      redis: redisTotal > 0 ? (this.stats.redisHits / redisTotal) * 100 : 0,
      overall: this.stats.totalRequests > 0 
        ? ((this.stats.memoryHits + this.stats.redisHits) / this.stats.totalRequests) * 100 
        : 0
    }
  }
}

// Singleton instance
export const progressiveCache = new ProgressiveCache()