import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { APIIndex, EndpointSummary, SearchResult } from '../config/types.js';
import logger from '../utils/logger.js';

export interface SwaggerMetadata {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
  definitions?: Record<string, any>; // Swagger 2.0
}

/**
 * Document metadata for intelligent cache updates
 */
export interface DocumentMetadata {
  etag?: string;
  lastModified?: string;
  contentHash: string;
  downloadedAt: number;
  expiresAt: number;
}

/**
 * Enhanced index with timestamp support
 */
export interface TimestampedAPIIndex extends APIIndex {
  timestamp?: number;
}

export class IndexedSwaggerLoader {
  private indexCache = new Map<string, TimestampedAPIIndex>();
  private metadataCache = new Map<string, SwaggerMetadata>();
  private documentMetadataCache = new Map<string, DocumentMetadata>();
  private cacheDir: string;

  constructor(cacheDir: string = '.swagger-cache') {
    this.cacheDir = cacheDir;
    this.ensureCacheDirectory();
  }

  /**
   * Create lightweight index for Swagger documentation
   */
  async createIncrementalIndex(
    swaggerUrl: string,
    sessionId: string,
    customHeaders?: Record<string, string>
  ): Promise<APIIndex> {
    const indexKey = this.generateIndexKey(swaggerUrl, sessionId);

    // Check cache first
    const cachedIndex = this.indexCache.get(indexKey);
    if (cachedIndex && !this.isIndexExpired(cachedIndex)) {
      logger.debug(`Using cached index for ${swaggerUrl}`);
      return cachedIndex;
    }

    logger.info(`Creating index for ${swaggerUrl}`);
    const startTime = Date.now();

    try {
      // Load only essential metadata with ETag/Last-Modified capture
      const { metadata, docMetadata } = await this.loadMetadata(swaggerUrl, customHeaders);

      // Store metadata and document metadata
      this.metadataCache.set(indexKey, metadata);
      this.documentMetadataCache.set(indexKey, docMetadata);

      // Build lightweight index
      const index = this.buildLightweightIndex(metadata, swaggerUrl);

      // Add timestamp to index
      (index as TimestampedAPIIndex).timestamp = Date.now();

      // Cache the index
      this.indexCache.set(indexKey, index as TimestampedAPIIndex);

      // Persist to disk
      await this.persistIndex(indexKey, index);

      const duration = Date.now() - startTime;
      logger.info(`Index created for ${swaggerUrl} in ${duration}ms`, {
        totalEndpoints: index.metadata.totalEndpoints,
        tags: index.metadata.tags.length,
        etag: docMetadata.etag || 'none',
        lastModified: docMetadata.lastModified || 'none'
      });

      return index;
    } catch (error) {
      logger.error(`Failed to create index for ${swaggerUrl}:`, error);
      throw error;
    }
  }

  /**
   * Load specific endpoint details on demand
   */
  async loadEndpointDetails(
    swaggerUrl: string,
    endpointPath: string,
    method: string,
    customHeaders?: Record<string, string>
  ): Promise<any> {
    const cacheKey = `${this.hashUrl(swaggerUrl)}_${endpointPath}_${method.toLowerCase()}`;

    try {
      // Try to load from cache first
      const cachedDetails = await this.loadEndpointFromDisk(cacheKey);
      if (cachedDetails) {
        return cachedDetails;
      }

      // Load full Swagger doc and extract specific endpoint
      const fullDoc = await this.loadFullSwaggerDocument(swaggerUrl, customHeaders);
      const endpoint = fullDoc.paths[endpointPath]?.[method.toLowerCase()];

      if (!endpoint) {
        throw new Error(`Endpoint ${method} ${endpointPath} not found`);
      }

      // Cache the endpoint details
      await this.saveEndpointToDisk(cacheKey, endpoint);

      return endpoint;
    } catch (error) {
      logger.error(`Failed to load endpoint details for ${method} ${endpointPath}:`, error);
      throw error;
    }
  }

  /**
   * Load only metadata (not full document) with ETag/Last-Modified capture
   */
  private async loadMetadata(
    swaggerUrl: string,
    customHeaders?: Record<string, string>
  ): Promise<{ metadata: SwaggerMetadata; docMetadata: DocumentMetadata }> {
    try {
      const response = await axios.get(swaggerUrl, {
        headers: {
          'User-Agent': 'Swagger-MCP-Indexed/2.0.0',
          ...customHeaders
        },
        timeout: 30000,
        maxRedirects: 5
      });

      const data = response.data;

      // Validate Swagger/OpenAPI format
      if (!data.openapi && !data.swagger) {
        throw new Error('Invalid Swagger/OpenAPI document');
      }

      // Capture ETag and Last-Modified headers
      const etag = response.headers['etag'] as string | undefined;
      const lastModified = response.headers['last-modified'] as string | undefined;

      // Calculate content hash for integrity verification
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');

      const docMetadata: DocumentMetadata = {
        etag,
        lastModified,
        contentHash,
        downloadedAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes default
      };

      const swaggerMetadata: SwaggerMetadata = {
        info: data.info,
        servers: data.servers,
        paths: data.paths || {},
        components: data.components,
        definitions: data.definitions
      };

      return { metadata: swaggerMetadata, docMetadata };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch Swagger document: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Build lightweight index from metadata
   */
  private buildLightweightIndex(metadata: SwaggerMetadata, swaggerUrl: string): APIIndex {
    const tagIndex = new Map<string, string[]>();
    const pathIndex = new Map<string, EndpointSummary>();
    const searchableIndex = new Map<string, SearchResult[]>();
    const allTags = new Set<string>();

    let endpointCount = 0;

    // Process each path and method
    for (const [path, pathItem] of Object.entries(metadata.paths)) {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        endpointCount++;

        const summary: EndpointSummary = {
          method: method.toUpperCase(),
          path,
          summary: operation.summary,
          description: operation.description,
          operationId: operation.operationId,
          tags: operation.tags || []
        };

        // Add to path index
        pathIndex.set(`${method.toUpperCase()}-${path}`, summary);

        // Process tags
        if (operation.tags) {
          for (const tag of operation.tags) {
            allTags.add(tag);

            if (!tagIndex.has(tag)) {
              tagIndex.set(tag, []);
            }
            tagIndex.get(tag)!.push(path);
          }
        }

        // Build searchable index
        this.addToSearchableIndex(searchableIndex, path, summary);
      }
    }

    return {
      metadata: {
        totalEndpoints: endpointCount,
        tags: Array.from(allTags),
        version: metadata.info.version,
        title: metadata.info.title,
        baseUrl: metadata.servers?.[0]?.url
      },
      tagIndex,
      pathIndex,
      searchableIndex
    };
  }

  /**
   * Add endpoint to searchable index
   */
  private addToSearchableIndex(
    searchableIndex: Map<string, SearchResult[]>,
    path: string,
    summary: EndpointSummary
  ): void {
    const searchText = [
      path,
      summary.summary || '',
      summary.description || '',
      summary.operationId || '',
      ...(summary.tags || [])
    ].join(' ').toLowerCase();

    // Extract keywords (simple tokenization)
    const keywords = this.extractKeywords(searchText);

    for (const keyword of keywords) {
      if (keyword.length < 2) continue; // Skip very short keywords

      if (!searchableIndex.has(keyword)) {
        searchableIndex.set(keyword, []);
      }

      searchableIndex.get(keyword)!.push({
        path,
        relevance: this.calculateRelevance(keyword, path, summary),
        method: summary.method,
        description: summary.description
      });
    }
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Split by non-alphanumeric characters and filter
    return text
      .split(/[^a-zA-Z0-9]+/)
      .filter(word => word.length > 1)
      .filter(word => !this.isStopWord(word));
  }

  /**
   * Simple stop word filter
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'can', 'must', 'this', 'that', 'these', 'those'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Calculate relevance score for keyword matching
   */
  private calculateRelevance(keyword: string, path: string, summary: EndpointSummary): number {
    let relevance = 0;

    // Exact path match gets highest score
    if (path.toLowerCase() === keyword) {
      relevance += 1.0;
    }
    // Path contains keyword
    else if (path.toLowerCase().includes(keyword)) {
      relevance += 0.8;
    }

    // Summary/description match
    if (summary.summary?.toLowerCase().includes(keyword)) {
      relevance += 0.4;
    }
    if (summary.description?.toLowerCase().includes(keyword)) {
      relevance += 0.3;
    }

    // Tag match
    if (summary.tags?.some(tag => tag.toLowerCase().includes(keyword))) {
      relevance += 0.5;
    }

    // Operation ID match
    if (summary.operationId?.toLowerCase().includes(keyword)) {
      relevance += 0.6;
    }

    return relevance;
  }

  /**
   * Load full Swagger document (expensive operation)
   */
  private async loadFullSwaggerDocument(
    swaggerUrl: string,
    customHeaders?: Record<string, string>
  ): Promise<any> {
    const response = await axios.get(swaggerUrl, {
      headers: {
        'User-Agent': 'Swagger-MCP/1.0.0',
        ...customHeaders
      },
      timeout: 60000
    });
    return response.data;
  }

  /**
   * Generate index key
   */
  private generateIndexKey(swaggerUrl: string, sessionId: string): string {
    const urlHash = this.hashUrl(swaggerUrl);
    return `${urlHash}_${sessionId}`;
  }

  /**
   * Hash URL for cache keys
   */
  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Check if index is expired using timestamp
   */
  private isIndexExpired(index: TimestampedAPIIndex): boolean {
    if (!index.timestamp) return true;
    // Default TTL: 30 minutes
    const ttl = 30 * 60 * 1000;
    return Date.now() - index.timestamp > ttl;
  }

  /**
   * Check if document needs refresh using ETag/Last-Modified
   */
  async needsRefresh(swaggerUrl: string, sessionId: string): Promise<boolean> {
    const indexKey = this.generateIndexKey(swaggerUrl, sessionId);
    const cached = this.indexCache.get(indexKey);
    const docMeta = this.documentMetadataCache.get(indexKey);

    // No cache available, needs refresh
    if (!cached || !docMeta) {
      return true;
    }

    // Check TTL expiration
    if (Date.now() > docMeta.expiresAt) {
      return true;
    }

    // Try conditional request to check if document changed
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Swagger-MCP-Indexed/2.0.0'
      };

      if (docMeta.etag) {
        headers['If-None-Match'] = docMeta.etag;
      }
      if (docMeta.lastModified) {
        headers['If-Modified-Since'] = docMeta.lastModified;
      }

      const response = await axios.head(swaggerUrl, {
        headers,
        timeout: 10000,
        maxRedirects: 5
      });

      // 304 Not Modified means cache is still valid
      if (response.status === 304) {
        // Update expiration time
        docMeta.expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes
        logger.debug(`Document not modified for ${swaggerUrl}`);
        return false;
      }

      // Any other status means document may have changed
      return response.status !== 304;
    } catch (error) {
      // On error, assume refresh is needed but log warning
      if (axios.isAxiosError(error)) {
        logger.warn(`Failed to check refresh status for ${swaggerUrl}: ${error.message}`);
      }
      return true;
    }
  }

  /**
   * Load with automatic refresh based on ETag/Last-Modified
   */
  async loadWithAutoRefresh(
    swaggerUrl: string,
    sessionId: string,
    customHeaders?: Record<string, string>
  ): Promise<APIIndex> {
    const needsUpdate = await this.needsRefresh(swaggerUrl, sessionId);

    if (!needsUpdate) {
      const indexKey = this.generateIndexKey(swaggerUrl, sessionId);
      const cached = this.indexCache.get(indexKey);
      if (cached) {
        logger.debug(`Using cached index for ${swaggerUrl} (auto-refresh check passed)`);
        return cached;
      }
    }

    // Need to refresh or no cache available
    logger.info(`Refreshing ${swaggerUrl} - document changed or cache expired`);
    return await this.createIncrementalIndex(swaggerUrl, sessionId, customHeaders);
  }

  /**
   * Get document metadata for a cached URL
   */
  getDocumentMetadata(swaggerUrl: string, sessionId: string): DocumentMetadata | null {
    const indexKey = this.generateIndexKey(swaggerUrl, sessionId);
    return this.documentMetadataCache.get(indexKey) || null;
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      logger.warn(`Failed to create cache directory ${this.cacheDir}:`, error);
    }
  }

  /**
   * Persist index to disk
   */
  private async persistIndex(indexKey: string, index: APIIndex): Promise<void> {
    try {
      const filePath = path.join(this.cacheDir, `index_${indexKey}.json`);
      const data = JSON.stringify({
        ...index,
        // Convert Maps to Objects for JSON serialization
        tagIndex: Object.fromEntries(index.tagIndex),
        pathIndex: Object.fromEntries(index.pathIndex),
        searchableIndex: Object.fromEntries(index.searchableIndex),
        timestamp: Date.now()
      });
      await fs.writeFile(filePath, data);
    } catch (error) {
      logger.warn(`Failed to persist index ${indexKey}:`, error);
    }
  }

  /**
   * Load endpoint details from disk cache
   */
  private async loadEndpointFromDisk(cacheKey: string): Promise<any | null> {
    try {
      const filePath = path.join(this.cacheDir, `endpoint_${cacheKey}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);

      // Check if still valid (30 minutes TTL)
      if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
        return parsed.data;
      }

      // Remove expired file
      await fs.unlink(filePath);
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save endpoint details to disk cache
   */
  private async saveEndpointToDisk(cacheKey: string, data: any): Promise<void> {
    try {
      const filePath = path.join(this.cacheDir, `endpoint_${cacheKey}.json`);
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      await fs.writeFile(filePath, JSON.stringify(cacheData));
    } catch (error) {
      logger.warn(`Failed to cache endpoint ${cacheKey}:`, error);
    }
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    this.indexCache.clear();
    this.metadataCache.clear();

    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      logger.info('Cache cleared');
    } catch (error) {
      logger.warn('Failed to clear disk cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryIndexes: this.indexCache.size,
      metadataEntries: this.metadataCache.size,
      cacheDirectory: this.cacheDir
    };
  }
}