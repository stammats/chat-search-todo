import { CacheItem } from './types'

export class SimpleMemoryCache {
  private cache = new Map<string, CacheItem<unknown>>()
  private readonly maxSize = 100

  set<T>(key: string, value: T, ttlSeconds: number = 3600): void {
    // TTL expired items cleanup
    this.cleanupExpired()
    
    // Max size check
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    
    this.cache.set(key, {
      data: value,
      expires: Date.now() + ttlSeconds * 1000
    })
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    if (!item || Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }
    return item.data as T
  }

  clear(): void {
    this.cache.clear()
  }

  private cleanupExpired(): void {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key)
      }
    }
  }

  size(): number {
    this.cleanupExpired()
    return this.cache.size
  }
}

// Singleton instance
export const cache = new SimpleMemoryCache()