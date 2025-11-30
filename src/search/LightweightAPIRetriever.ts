import { APIIndex, SearchResult, EndpointSummary, SearchParams } from '../config/types.js';
import logger from '../utils/logger.js';

export class LightweightAPIRetriever {

  /**
   * Search endpoints by tags
   */
  searchByTag(index: APIIndex, tags: string[]): SearchResult[] {
    const results: SearchResult[] = [];
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    for (const tag of tagSet) {
      const paths = index.tagIndex.get(tag) || [];
      for (const path of paths) {
        // Find all methods for this path
        for (const [key, summary] of index.pathIndex) {
          if (summary.path === path) {
            results.push({
              path,
              relevance: 1.0, // Exact tag match gets highest relevance
              method: summary.method,
              description: summary.description,
              tag
            });
          }
        }
      }
    }

    const deduplicated = this.deduplicateResults(results);
    logger.debug(`Tag search for [${tags.join(', ')}] found ${deduplicated.length} results`);
    return deduplicated;
  }

  /**
   * Search endpoints by path pattern
   */
  searchByPattern(index: APIIndex, pattern: string): SearchResult[] {
    const regex = this.createSmartPattern(pattern);
    const matches: SearchResult[] = [];
    const lowerPattern = pattern.toLowerCase();

    for (const [key, summary] of index.pathIndex) {
      let relevance = 0;

      // Exact path match
      if (summary.path === pattern) {
        relevance = 1.0;
      }
      // Path contains pattern
      else if (summary.path.toLowerCase().includes(lowerPattern)) {
        relevance = 0.8;
      }
      // Regex pattern match
      else if (regex.test(summary.path)) {
        relevance = 0.6;
      }
      // Description contains pattern
      else if (summary.description && summary.description.toLowerCase().includes(lowerPattern)) {
        relevance = 0.4;
      }
      // Summary contains pattern
      else if (summary.summary && summary.summary.toLowerCase().includes(lowerPattern)) {
        relevance = 0.4;
      }

      if (relevance > 0) {
        matches.push({
          path: summary.path,
          relevance,
          method: summary.method,
          description: summary.description || summary.summary
        });
      }
    }

    const sorted = matches.sort((a, b) => b.relevance - a.relevance);
    logger.debug(`Pattern search for '${pattern}' found ${sorted.length} results`);
    return sorted;
  }

  /**
   * Search endpoints by keywords
   */
  searchByKeywords(index: APIIndex, keywords: string[]): SearchResult[] {
    const keywordMatches = new Map<string, SearchResult>();
    const expandedKeywords = this.expandKeywords(keywords);

    for (const keyword of expandedKeywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Search in paths
      for (const [key, summary] of index.pathIndex) {
        if (summary.path.toLowerCase().includes(lowerKeyword)) {
          this.addOrUpdateMatch(keywordMatches, summary, 0.5, 'path');
        }

        // Search in description
        if (summary.description && summary.description.toLowerCase().includes(lowerKeyword)) {
          this.addOrUpdateMatch(keywordMatches, summary, 0.2, 'description');
        }

        // Search in summary
        if (summary.summary && summary.summary.toLowerCase().includes(lowerKeyword)) {
          this.addOrUpdateMatch(keywordMatches, summary, 0.3, 'summary');
        }

        // Search in operationId
        if (summary.operationId && summary.operationId.toLowerCase().includes(lowerKeyword)) {
          this.addOrUpdateMatch(keywordMatches, summary, 0.4, 'operationId');
        }

        // Search in tags
        if (summary.tags) {
          for (const tag of summary.tags) {
            if (tag.toLowerCase().includes(lowerKeyword)) {
              this.addOrUpdateMatch(keywordMatches, summary, 0.6, 'tag');
              break;
            }
          }
        }
      }

      // Also use pre-built searchable index if available
      const indexMatches = index.searchableIndex.get(lowerKeyword);
      if (indexMatches) {
        for (const match of indexMatches) {
          for (const [key, summary] of index.pathIndex) {
            if (summary.path === match.path) {
              this.addOrUpdateMatch(keywordMatches, summary, match.relevance, 'index');
              break;
            }
          }
        }
      }
    }

    const results = Array.from(keywordMatches.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 50); // Limit results for performance

    logger.debug(`Keyword search for [${keywords.join(', ')}] found ${results.length} results`);
    return results;
  }

  /**
   * Filter results by HTTP methods
   */
  filterByMethod(results: SearchResult[], methods: string[]): SearchResult[] {
    if (!methods || methods.length === 0) {
      return results;
    }

    const methodSet = new Set(methods.map(m => m.toUpperCase()));
    const filtered = results.filter(result =>
      !result.method || methodSet.has(result.method.toUpperCase())
    );

    logger.debug(`Method filter [${methods.join(', ')}] reduced results from ${results.length} to ${filtered.length}`);
    return filtered;
  }

  /**
   * Apply search parameters to index
   */
  applySearchParams(index: APIIndex, params: SearchParams): SearchResult[] {
    let results: SearchResult[] = [];

    // Determine search strategy based on available parameters
    if (params.tags && params.tags.length > 0) {
      results = this.searchByTag(index, params.tags);
    } else if (params.pattern) {
      results = this.searchByPattern(index, params.pattern);
    } else if (params.keywords && params.keywords.length > 0) {
      results = this.searchByKeywords(index, params.keywords);
    } else {
      // No search criteria - return top endpoints
      results = Array.from(index.pathIndex.entries())
        .slice(0, params.limit || 20)
        .map(([key, summary]) => ({
          path: summary.path,
          relevance: 0.1,
          method: summary.method,
          description: summary.description || summary.summary
        }));
    }

    // Apply method filter
    if (params.methods && params.methods.length > 0) {
      results = this.filterByMethod(results, params.methods);
    }

    // Apply limit
    const finalResults = results.slice(0, params.limit || 20);

    logger.debug(`Search completed: ${finalResults.length} results returned`, {
      originalParams: params,
      totalBeforeFilter: results.length
    });

    return finalResults;
  }

  /**
   * Get endpoint suggestions based on partial input
   */
  getSuggestions(index: APIIndex, partial: string, limit: number = 5): string[] {
    const lowerPartial = partial.toLowerCase();
    const suggestions = new Set<string>();

    // Path suggestions
    for (const summary of index.pathIndex.values()) {
      if (summary.path.toLowerCase().startsWith(lowerPartial)) {
        suggestions.add(summary.path);
        if (suggestions.size >= limit) break;
      }
    }

    // Tag suggestions if we don't have enough path matches
    if (suggestions.size < limit) {
      for (const tag of index.metadata.tags) {
        if (tag.toLowerCase().includes(lowerPartial)) {
          suggestions.add(tag);
          if (suggestions.size >= limit) break;
        }
      }
    }

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get popular endpoints (based on typical API patterns)
   */
  getPopularEndpoints(index: APIIndex, limit: number = 10): SearchResult[] {
    const popular = [];
    const popularPatterns = [
      { pattern: '/health', relevance: 0.9 },
      { pattern: '/status', relevance: 0.9 },
      { pattern: '/version', relevance: 0.8 },
      { pattern: '/users', relevance: 0.8 },
      { pattern: '/auth', relevance: 0.8 },
      { pattern: '/login', relevance: 0.8 },
      { pattern: '/logout', relevance: 0.7 },
      { pattern: '/profile', relevance: 0.7 },
      { pattern: '/config', relevance: 0.6 },
      { pattern: '/settings', relevance: 0.6 }
    ];

    for (const { pattern, relevance } of popularPatterns) {
      const matches = this.searchByPattern(index, pattern);
      if (matches.length > 0) {
        popular.push(...matches.slice(0, 1)); // Take the best match for each pattern
        if (popular.length >= limit) break;
      }
    }

    return popular.slice(0, limit);
  }

  /**
   * Create smart regex pattern from simple string
   */
  private createSmartPattern(pattern: string): RegExp {
    // Escape regex special characters except our wildcards
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\\\*/g, '[^/]*') // Convert * to [^/]*
      .replace(/\\\?/g, '[^/]') // Convert ? to [^/]
      .replace(/\\\{[^}]*\\\}/g, '[^/]+'); // Convert {param} to [^/]+

    try {
      return new RegExp(regexPattern, 'i');
    } catch (error) {
      // Fallback to simple contains search if regex is invalid
      logger.warn(`Invalid pattern '${pattern}', falling back to contains search`);
      return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  }

  /**
   * Expand keywords with simple synonyms
   */
  private expandKeywords(keywords: string[]): string[] {
    const synonyms: Record<string, string[]> = {
      'get': ['fetch', 'retrieve', 'read'],
      'post': ['create', 'add', 'insert'],
      'put': ['update', 'modify', 'edit'],
      'delete': ['remove', 'destroy'],
      'user': ['account', 'profile'],
      'list': ['get', 'fetch', 'retrieve'],
      'info': ['information', 'details'],
      'auth': ['authentication', 'login'],
      'config': ['configuration', 'settings']
    };

    const expanded = [...keywords];

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      const keywordSynonyms = synonyms[lowerKeyword];
      if (keywordSynonyms) {
        expanded.push(...keywordSynonyms);
      }
    }

    return expanded;
  }

  /**
   * Add or update search result match
   */
  private addOrUpdateMatch(
    matches: Map<string, SearchResult>,
    summary: EndpointSummary,
    relevance: number,
    source: string
  ): void {
    const key = `${summary.method}-${summary.path}`;
    const existing = matches.get(key);

    if (existing) {
      // Increase relevance for multiple matches
      existing.relevance += relevance * 0.3; // Bonus for multiple keyword matches
    } else {
      matches.set(key, {
        path: summary.path,
        relevance,
        method: summary.method,
        description: summary.description || summary.summary
      });
    }
  }

  /**
   * Remove duplicate results
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = `${result.method || 'ALL'}-${result.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}