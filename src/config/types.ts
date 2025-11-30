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