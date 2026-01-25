/**
 * listEndpoints Adapter
 *
 * Adapter that bridges the original listEndpoints tool
 * to use the new search-based infrastructure with fallback to file reading.
 *
 * Features:
 * - Summary mode for reduced token usage
 * - Pagination support
 * - Smart defaults for large APIs
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SwaggerSearchTool } from '../../search/SwaggerSearchTool.js';
import { getSessionConfigManager } from '../../config/SessionConfigManager.js';
import logger from '../../utils/logger.js';

// Global search tool instance
let searchTool: SwaggerSearchTool | null = null;

function getSearchTool(): SwaggerSearchTool {
  if (!searchTool) {
    searchTool = new SwaggerSearchTool();
  }
  return searchTool;
}

/**
 * Read session ID from config (supports both new and legacy formats)
 */
async function readSessionFromConfig(swaggerFilePath: string): Promise<string | null> {
  try {
    const dir = path.dirname(swaggerFilePath);

    // Try new .claude/swagger-mcp.json format first
    try {
      const newConfigPath = path.join(dir, '.claude', 'swagger-mcp.json');
      const newConfigContent = await fs.readFile(newConfigPath, 'utf-8');
      const newConfig = JSON.parse(newConfigContent);
      if (newConfig.sessionId) {
        return newConfig.sessionId;
      }
    } catch {
      // New format not found, try legacy
    }

    // Try legacy .swagger-mcp format
    const legacyConfigPath = path.join(dir, '.swagger-mcp');
    const legacyConfigContent = await fs.readFile(legacyConfigPath, 'utf-8');
    const sessionMatch = legacyConfigContent.match(/SWAGGER_SESSION_ID=([^\s\n]+)/);
    if (sessionMatch) {
      return sessionMatch[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Derive session ID from file path (fallback)
 */
function deriveSessionIdFromPath(filePath: string): string {
  const pathHash = crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16);
  return `session_${pathHash}`;
}

/**
 * Get URL from session
 */
async function getUrlFromSession(sessionId: string): Promise<string | null> {
  const sessionManager = getSessionConfigManager();
  const session = sessionManager.getSession(sessionId);
  return session?.swaggerUrls?.[0] || null;
}

/**
 * Fallback to file-based endpoint listing
 */
async function listEndpointsFromFile(
  swaggerFilePath: string,
  options: {
    summary?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ endpoints: any[]; total: number }> {
  const swaggerContent = await fs.readFile(swaggerFilePath, 'utf8');
  const swaggerJson = JSON.parse(swaggerContent);
  const paths = swaggerJson.paths || {};

  const allEndpoints: any[] = [];

  for (const path in paths) {
    const pathItem = paths[path];

    for (const method in pathItem) {
      if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
        const operation = pathItem[method];

        if (options.summary) {
          // Summary mode: only path and method
          allEndpoints.push({
            path,
            method: method.toUpperCase()
          });
        } else {
          // Full mode: all details
          allEndpoints.push({
            path,
            method: method.toUpperCase(),
            summary: operation.summary,
            description: operation.description,
            operationId: operation.operationId,
            tags: operation.tags
          });
        }
      }
    }
  }

  // Apply pagination
  const offset = options.offset || 0;
  const limit = options.limit ? Math.min(options.limit, 1000) : 50; // Default 50, max 1000
  const paginatedEndpoints = allEndpoints.slice(offset, offset + limit);

  return {
    endpoints: paginatedEndpoints,
    total: allEndpoints.length
  };
}

/**
 * Format endpoint list as compact text (for summary mode)
 */
function formatCompactEndpoints(endpoints: any[]): string {
  return endpoints
    .map(e => `${e.method.padEnd(8)} ${e.path}`)
    .join('\n');
}

/**
 * Format endpoint list with grouping (for full mode)
 */
function formatFullEndpoints(endpoints: any[]): string {
  return endpoints
    .map(e => {
      const parts = [`\`${e.method} ${e.path}\``];
      if (e.summary) parts.push(`- ${e.summary}`);
      if (e.tags && e.tags.length > 0) parts.push(`[Tags: ${e.tags.join(', ')}]`);
      return parts.join(' ');
    })
    .join('\n\n');
}

/**
 * Adapter handler for listEndpoints
 */
export async function handleListEndpointsAdapter(input: {
  swaggerFilePath: string;
  useSearch?: boolean;
  summary?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const startTime = Date.now();

  try {
    logger.info(`listEndpoints adapter called`, {
      filePath: input.swaggerFilePath,
      summary: input.summary,
      limit: input.limit,
      offset: input.offset
    });

    const {
      swaggerFilePath,
      useSearch = true,
      summary = false,
      limit = 50,
      offset = 0
    } = input;

    // Verify file exists
    try {
      await fs.access(swaggerFilePath);
    } catch {
      return {
        content: [{
          type: 'text',
          text: `❌ **File Not Found**

Swagger file not found at: ${swaggerFilePath}

**Solution:**
Use getSwaggerDefinition to download the API documentation first.`
        }]
      };
    }

    // Try to use session-based search first
    if (useSearch) {
      const sessionId = await readSessionFromConfig(swaggerFilePath);

      if (sessionId) {
        const url = await getUrlFromSession(sessionId);

        if (url) {
          logger.info(`Using session-based search for ${url}`);

          // Use search with wildcard pattern to get endpoints
          const searchLimit = summary ? limit : Math.min(limit * 2, 1000);
          const result = await getSearchTool().searchEndpoints({
            swagger_url: url,
            session_id: sessionId,
            search_type: 'pattern',
            query: '*',
            limit: searchLimit
          });

          const duration = Date.now() - startTime;

          // Apply pagination to results
          const allResults = result.results;
          const paginatedResults = allResults.slice(offset, offset + limit);

          // Format based on mode
          let responseText = summary
            ? `📋 **API Endpoints Summary**

**Source:** ${result.api_info.title} v${result.api_info.version}
**Showing:** ${paginatedResults.length} / ${result.total_found} endpoints
**Page:** ${Math.floor(offset / limit) + 1}

${formatCompactEndpoints(paginatedResults.map(r => ({
  method: r.method || 'GET',
  path: r.path
})))}

---
**Pagination:**
- Current page: ${Math.floor(offset / limit) + 1}
- To get next page: offset=${offset + limit}
- To get all, increase limit (max 1000)
- Use summary=false for detailed descriptions`
            : `📋 **API Endpoints**

**Source:** ${result.api_info.title} v${result.api_info.version}
**Showing:** ${paginatedResults.length} / ${result.total_found} endpoints
**Search Time:** ${result.search_time_ms}ms

${formatFullEndpoints(paginatedResults.map(r => ({
  method: r.method || 'GET',
  path: r.path,
  summary: r.description?.substring(0, 100),
  tags: []
})))}

---
**Info:**
- Use summary=true for compact view
- Adjust limit/offset for pagination
- Use get_endpoint_details for complete information`;

          responseText += `\n\n**Performance:** ${duration}ms`;

          return {
            content: [{ type: 'text', text: responseText }]
          };
        }
      }
    }

    // Fall back to file-based approach
    logger.info(`Falling back to file-based endpoint listing`);

    const { endpoints, total } = await listEndpointsFromFile(swaggerFilePath, {
      summary,
      limit,
      offset
    });
    const duration = Date.now() - startTime;

    const endpointText = summary
      ? formatCompactEndpoints(endpoints)
      : formatFullEndpoints(endpoints);

    const responseText = `📋 **Endpoints Listed Successfully (via File)**

**Total Endpoints:** ${total}
**Showing:** ${endpoints.length}
**Mode:** ${summary ? 'Summary' : 'Full'}
**Load Time:** ${duration}ms

${endpointText}

---
**Note:** Using file-based approach. For better performance and auto-refresh,
consider using the session-based tools instead.`;

    return {
      content: [{ type: 'text', text: responseText }]
    };

  } catch (error: any) {
    logger.error(`listEndpoints adapter error: ${error.message}`);

    // Try fallback to file-based approach on error
    try {
      const { endpoints, total } = await listEndpointsFromFile(input.swaggerFilePath, {
        summary: input.summary || false,
        limit: input.limit || 50,
        offset: input.offset || 0
      });
      const duration = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: `⚠️ **Endpoints Listed (Fallback Mode)**

**Total Endpoints:** ${total}
**Showing:** ${endpoints.length}
**Load Time:** ${duration}ms

${input.summary ? formatCompactEndpoints(endpoints) : formatFullEndpoints(endpoints)}

**Note:** Search failed, fell back to file reading. Error was: ${error.message}`
        }]
      };
    } catch {
      return {
        content: [{
          type: 'text',
          text: `❌ **Failed to List Endpoints**

Error: ${error.message}

**Troubleshooting:**
- Verify the swagger file exists and is valid JSON
- Check that the file was downloaded correctly
- Ensure the file path is correct`
        }]
      };
    }
  }
}

/**
 * Export the adapter for use in tools/index.ts
 */
export const listEndpointsAdapter = {
  handler: handleListEndpointsAdapter
};
