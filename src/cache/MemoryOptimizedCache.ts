import { LRUCache } from 'lru-cache';
import { CacheEntry } from '../config/types.js';
import logger from '../utils/logger.js';

export interface CacheOptions {
  maxSize?: number;
  ttl?: number; // Default TTL in milliseconds
  checkPeriod?: number; // Cleanup check interval
  memoryThreshold?: number; // MB
}

export class MemoryOptimizedCache<T> {
  private lruCache: LRUCache<string, CacheEntry<T>>;
  private memoryThreshold: number; // MB
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0
  };

  constructor(options: CacheOptions = {}) {
    const {
      maxSize = 100,
      ttl = 10 * 60 * 1000, // 10 minutes default
      checkPeriod = 60 * 1000, // 1 minute
      memoryThreshold = 512 // 512MB
    } = options;

    this.memoryThreshold = memoryThreshold;

    this.lruCache = new LRUCache<string, CacheEntry<T>>({
      max: maxSize,
      ttl,
      updateAgeOnGet: true,
      allowStale: false,
      dispose: (value: any, key: string) => {
        this.stats.evictions++;
        logger.debug(`Cache entry evicted: ${key}`);
      }
    });

    // Start cleanup timer
    this.startCleanupTimer(checkPeriod);
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.lruCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.lruCache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    logger.debug(`Cache hit: ${key}`);
    return entry.data;
  }

  /**
   * Set value in cache with optional TTL
   */
  set(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: ttl || this.lruCache.ttl,
      accessCount: 1,
      lastAccessed: now
    };

    // Check memory usage before setting
    if (this.isNearMemoryLimit()) {
      logger.warn('Near memory limit, triggering cleanup');
      this.performCleanup();
    }

    this.lruCache.set(key, entry);
    this.stats.sets++;

    logger.debug(`Cache set: ${key}`);
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const deleted = this.lruCache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      logger.debug(`Cache delete: ${key}`);
    }
    return deleted;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.lruCache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.lruCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.lruCache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memoryUsage = process.memoryUsage();
    const cacheSize = this.lruCache.size;

    return {
      size: cacheSize,
      maxSize: this.lruCache.max,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      ...this.stats,
      memoryUsage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100 // MB
      },
      memoryThreshold: this.memoryThreshold,
      isNearMemoryLimit: this.isNearMemoryLimit()
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.lruCache.keys());
  }

  /**
   * Get entries sorted by access frequency
   */
  getHotEntries(limit: number = 10): Array<{ key: string; accessCount: number; lastAccessed: number }> {
    const entries: Array<{ key: string; accessCount: number; lastAccessed: number }> = [];

    for (const [key, entry] of this.lruCache.entries()) {
      if (!this.isExpired(entry)) {
        entries.push({
          key,
          accessCount: entry.accessCount,
          lastAccessed: entry.lastAccessed
        });
      }
    }

    return entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Get entries that are about to expire
   */
  getExpiringEntries(withinMs: number = 5 * 60 * 1000): Array<{ key: string; expiresAt: number }> {
    const now = Date.now();
    const entries: Array<{ key: string; expiresAt: number }> = [];

    for (const [key, entry] of this.lruCache.entries()) {
      const expiresAt = entry.timestamp + entry.ttl;
      if (expiresAt - now < withinMs) {
        entries.push({ key, expiresAt });
      }
    }

    return entries.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  /**
   * Perform cleanup of expired entries
   */
  performCleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.lruCache.entries()) {
      if (this.isExpired(entry)) {
        this.lruCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      logger.debug('Forced garbage collection');
      return true;
    }
    return false;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Check if near memory limit
   */
  private isNearMemoryLimit(): boolean {
    const memoryUsage = process.memoryUsage();
    const thresholdBytes = this.memoryThreshold * 1024 * 1024;
    return memoryUsage.heapUsed > thresholdBytes * 0.8; // 80% of threshold
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(checkPeriod: number): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.performCleanup();

        // Log periodic stats
        const stats = this.getStats();
        if (stats.isNearMemoryLimit) {
          logger.warn('Cache near memory limit', {
            heapUsed: stats.memoryUsage.heapUsed,
            threshold: this.memoryThreshold,
            cacheSize: stats.size
          });
        }
      } catch (error) {
        logger.error('Error during cache cleanup:', error);
      }
    }, checkPeriod);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
    logger.info('MemoryOptimizedCache destroyed');
  }
}

/**
 * Factory function to create typed caches
 */
export function createCache<T>(options: CacheOptions = {}): MemoryOptimizedCache<T> {
  return new MemoryOptimizedCache<T>(options);
}

/**
 * Singleton cache manager for multiple cache types
 */
export class CacheManager {
  private caches = new Map<string, MemoryOptimizedCache<any>>();
  private defaultOptions: CacheOptions;

  constructor(defaultOptions: CacheOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a cache instance
   */
  getCache<T>(name: string, options?: CacheOptions): MemoryOptimizedCache<T> {
    if (!this.caches.has(name)) {
      const cache = new MemoryOptimizedCache<T>({ ...this.defaultOptions, ...options });
      this.caches.set(name, cache);
    }
    return this.caches.get(name)!;
  }

  /**
   * Get all cache statistics
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, cache] of this.caches) {
      stats[name] = cache.getStats();
    }
    return stats;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Destroy all caches
   */
  destroyAll(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }
}

// Global cache manager instance
let globalCacheManager: CacheManager | null = null;

export function getCacheManager(defaultOptions?: CacheOptions): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(defaultOptions);
  }
  return globalCacheManager;
}