import crypto from 'crypto';
import { IndexedSwaggerLoader } from '../cache/IndexedSwaggerLoader.js';
import { LightweightAPIRetriever } from './LightweightAPIRetriever.js';
import { createCache, getCacheManager } from '../cache/MemoryOptimizedCache.js';
import { getSessionConfigManager } from '../config/SessionConfigManager.js';
import { SearchParams, SearchResult, APIIndex } from '../config/types.js';
import logger from '../utils/logger.js';

export interface SearchSwaggerEndpointsParams {
  swagger_url: string;
  session_id: string;
  search_type: 'keywords' | 'tags' | 'pattern';
  query: string;
  methods?: string[];
  limit?: number;
}

export interface GetEndpointDetailsParams {
  swagger_url: string;
  session_id: string;
  endpoint_paths: string[];
  methods?: string[];
}

export interface ConfigureSessionParams {
  session_id: string;
  swagger_urls: string[];
  custom_headers?: Record<string, string>;
  cache_ttl?: number;
  rate_limit?: {
    requests_per_second: number;
    burst_size: number;
  };
}

export class SwaggerSearchTool {
  private loader: IndexedSwaggerLoader;
  private retriever: LightweightAPIRetriever;
  private indexCache = createCache<APIIndex>({ maxSize: 50, ttl: 30 * 60 * 1000 }); // 30 minutes
  private sessionManager = getSessionConfigManager();

  constructor() {
    this.loader = new IndexedSwaggerLoader();
    this.retriever = new LightweightAPIRetriever();
  }

  /**
   * Search Swagger endpoints efficiently
   */
  async searchEndpoints(params: SearchSwaggerEndpointsParams): Promise<{
    results: SearchResult[];
    total_found: number;
    search_time_ms: number;
    api_info: {
      title: string;
      version: string;
      total_endpoints: number;
      tags: string[];
    };
  }> {
    const startTime = Date.now();

    try {
      // Validate session
      const session = this.sessionManager.getSession(params.session_id);
      if (!session) {
        throw new Error(`Invalid session ID: ${params.session_id}`);
      }

      // Update session access time
      this.sessionManager.updateAccessTime(params.session_id);

      logger.info(`Searching endpoints for ${params.swagger_url}`, {
        sessionId: params.session_id,
        searchType: params.search_type,
        query: params.query
      });

      // Get or create index
      const index = await this.getOrCreateIndex(params.swagger_url, params.session_id);

      // Build search parameters
      const searchParams: SearchParams = {
        limit: params.limit || 20,
        methods: params.methods
      };

      switch (params.search_type) {
        case 'keywords':
          searchParams.keywords = params.query.split(/\s+/).filter(k => k.length > 0);
          break;
        case 'tags':
          searchParams.tags = params.query.split(',').map(t => t.trim()).filter(t => t.length > 0);
          break;
        case 'pattern':
          searchParams.pattern = params.query;
          break;
      }

      // Perform search
      const results = this.retriever.applySearchParams(index, searchParams);

      const searchTime = Date.now() - startTime;

      logger.info(`Search completed for ${params.swagger_url}`, {
        sessionId: params.session_id,
        resultsCount: results.length,
        searchTimeMs: searchTime
      });

      return {
        results,
        total_found: results.length,
        search_time_ms: searchTime,
        api_info: {
          title: index.metadata.title,
          version: index.metadata.version,
          total_endpoints: index.metadata.totalEndpoints,
          tags: index.metadata.tags
        }
      };

    } catch (error) {
      logger.error(`Search failed for ${params.swagger_url}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed information for specific endpoints
   */
  async getEndpointDetails(params: GetEndpointDetailsParams): Promise<{
    endpoints: Array<{
      path: string;
      method: string;
      details: any;
    }>;
    load_time_ms: number;
  }> {
    const startTime = Date.now();

    try {
      // Validate session
      const session = this.sessionManager.getSession(params.session_id);
      if (!session) {
        throw new Error(`Invalid session ID: ${params.session_id}`);
      }

      // Update session access time
      this.sessionManager.updateAccessTime(params.session_id);

      logger.info(`Loading endpoint details for ${params.swagger_url}`, {
        sessionId: params.session_id,
        endpointCount: params.endpoint_paths.length
      });

      const endpoints = [];

      for (const endpointPath of params.endpoint_paths) {
        const methods = params.methods || ['GET']; // Default to GET if not specified

        for (const method of methods) {
          try {
            const details = await this.loader.loadEndpointDetails(
              params.swagger_url,
              endpointPath,
              method,
              session.customHeaders
            );

            endpoints.push({
              path: endpointPath,
              method: method.toUpperCase(),
              details
            });
          } catch (error) {
            logger.warn(`Failed to load details for ${method} ${endpointPath}:`, error);
            // Continue with other endpoints instead of failing completely
          }
        }
      }

      const loadTime = Date.now() - startTime;

      logger.info(`Endpoint details loaded`, {
        sessionId: params.session_id,
        loadedCount: endpoints.length,
        loadTimeMs: loadTime
      });

      return {
        endpoints,
        load_time_ms: loadTime
      };

    } catch (error) {
      logger.error(`Failed to load endpoint details for ${params.swagger_url}:`, error);
      throw error;
    }
  }

  /**
   * Configure a new session
   */
  async configureSession(params: ConfigureSessionParams): Promise<{
    session_id: string;
    status: 'created' | 'updated';
    swagger_urls_configured: number;
    cache_ttl: number;
  }> {
    try {
      logger.info(`Configuring session ${params.session_id}`, {
        swaggerUrls: params.swagger_urls.length,
        cacheTTL: params.cache_ttl
      });

      const session = this.sessionManager.createOrUpdateSession(params.session_id, {
        swaggerUrls: params.swagger_urls,
        customHeaders: params.custom_headers,
        cacheTTL: params.cache_ttl,
        rateLimit: params.rate_limit ? {
          requestsPerSecond: params.rate_limit.requests_per_second,
          burstSize: params.rate_limit.burst_size
        } : undefined
      });

      const status = session.createdAt === session.lastAccessed ? 'created' : 'updated';

      logger.info(`Session ${params.session_id} ${status}`, {
        swaggerUrls: session.swaggerUrls.length,
        cacheTTL: session.cacheTTL
      });

      return {
        session_id: session.id,
        status,
        swagger_urls_configured: session.swaggerUrls.length,
        cache_ttl: session.cacheTTL || 0
      };

    } catch (error) {
      logger.error(`Failed to configure session ${params.session_id}:`, error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    session_info: {
      id: string;
      swagger_urls: string[];
      cache_ttl: number;
      is_active: boolean;
      created_at: number;
      last_accessed: number;
    } | null;
    cache_stats: {
      index_cache_size: number;
      memory_usage_mb: number;
      hit_rate: number;
    };
    system_stats: {
      active_sessions: number;
      total_sessions: number;
      memory_usage_mb: number;
    };
  }> {
    try {
      const session = this.sessionManager.getSession(sessionId);
      const cacheStats = this.indexCache.getStats();
      const systemStats = this.sessionManager.getStats();

      return {
        session_info: session ? {
          id: session.id,
          swagger_urls: session.swaggerUrls,
          cache_ttl: session.cacheTTL || 0,
          is_active: session.isActive,
          created_at: session.createdAt,
          last_accessed: session.lastAccessed
        } : null,
        cache_stats: {
          index_cache_size: cacheStats.size,
          memory_usage_mb: cacheStats.memoryUsage.heapUsed,
          hit_rate: cacheStats.hitRate
        },
        system_stats: {
          active_sessions: systemStats.activeSessions,
          total_sessions: systemStats.totalSessions,
          memory_usage_mb: systemStats.memoryUsage.heapUsed
        }
      };

    } catch (error) {
      logger.error(`Failed to get session stats for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache for a specific URL or all caches
   */
  async clearCache(swaggerUrl?: string, sessionId?: string): Promise<{
    cleared_items: number;
    cache_type: 'specific' | 'all';
  }> {
    try {
      let clearedCount = 0;

      if (swaggerUrl && sessionId) {
        // Clear specific index
        const indexKey = this.generateIndexKey(swaggerUrl, sessionId);
        if (this.indexCache.delete(indexKey)) {
          clearedCount = 1;
        }
      } else {
        // Clear all caches
        const beforeSize = this.indexCache.getStats().size;
        this.indexCache.clear();
        clearedCount = beforeSize;
        await this.loader.clearCache();
      }

      logger.info(`Cache cleared`, {
        clearedCount,
        swaggerUrl: swaggerUrl || 'all',
        sessionId: sessionId || 'all'
      });

      return {
        cleared_items: clearedCount,
        cache_type: swaggerUrl ? 'specific' : 'all'
      };

    } catch (error) {
      logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get or create index with caching
   */
  private async getOrCreateIndex(swaggerUrl: string, sessionId: string): Promise<APIIndex> {
    const indexKey = this.generateIndexKey(swaggerUrl, sessionId);

    // Try memory cache first
    let index = this.indexCache.get(indexKey);
    if (index) {
      return index;
    }

    // Try to get session configuration
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }

    // Create new index
    index = await this.loader.createIncrementalIndex(
      swaggerUrl,
      sessionId,
      session.customHeaders
    );

    // Cache the index
    this.indexCache.set(indexKey, index);

    return index;
  }

  /**
   * Generate index key
   */
  private generateIndexKey(swaggerUrl: string, sessionId: string): string {
    const urlHash = crypto.createHash('sha256').update(swaggerUrl).digest('hex').substring(0, 16);
    return `${urlHash}_${sessionId}`;
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(swaggerUrl: string, sessionId: string, partial: string, limit: number = 5): Promise<{
    suggestions: string[];
    popular_endpoints: SearchResult[];
  }> {
    try {
      const index = await this.getOrCreateIndex(swaggerUrl, sessionId);
      const suggestions = this.retriever.getSuggestions(index, partial, limit);
      const popularEndpoints = this.retriever.getPopularEndpoints(index, limit);

      return {
        suggestions,
        popular_endpoints: popularEndpoints
      };

    } catch (error) {
      logger.error(`Failed to get search suggestions for ${swaggerUrl}:`, error);
      throw error;
    }
  }

  /**
   * Destroy the search tool and cleanup resources
   */
  destroy(): void {
    this.indexCache.destroy();
  }
}