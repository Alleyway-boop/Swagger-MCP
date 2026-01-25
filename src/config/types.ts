export interface SwaggerConfig {
  swaggerUrls: string[];
  customHeaders?: Record<string, string>;
  cacheTTL?: number; // Time to live in milliseconds
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };
}

export interface SessionConfig extends SwaggerConfig {
  id: string;
  createdAt: number;
  lastAccessed: number;
  isActive: boolean;
}

export interface GlobalConfig {
  defaultCacheTTL: number;
  maxSessions: number;
  sessionCleanupInterval: number;
  memoryThreshold: number; // MB
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface SearchParams {
  keywords?: string[];
  tags?: string[];
  pattern?: string;
  methods?: string[];
  limit?: number;
}

export interface SearchResult {
  path: string;
  relevance: number;
  method?: string;
  description?: string;
  tag?: string;
}

export interface EndpointSummary {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
}

export interface APIIndex {
  metadata: {
    totalEndpoints: number;
    tags: string[];
    version: string;
    title: string;
    baseUrl?: string;
  };
  tagIndex: Map<string, string[]>;
  pathIndex: Map<string, EndpointSummary>;
  searchableIndex: Map<string, SearchResult[]>;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Configuration format for .claude/swagger-mcp.json
 * Used to associate a project with a specific Swagger API
 */
export interface ClaudeSwaggerConfig {
  sessionId: string;
  swaggerUrl: string;
  service?: string;          // 微服务名称
}

/**
 * Enhanced configuration options for getSwaggerDefinition
 */
export interface SwaggerDefinitionOptions {
  url: string;
  saveLocation: string;
  service?: string;          // 微服务名称（用于 swagger-resources 场景）
  autoDetect?: boolean;      // 启用自动检测（默认：true）
  autoSession?: boolean;     // 自动创建会话（默认：true）
  sessionConfig?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
  };
}