/**
 * listEndpoints Adapter
 *
 * Adapter that bridges the original listEndpoints tool
 * to use the new search-based infrastructure with fallback to file reading.
 */

import fs from 'fs/promises';
import path from 'path';
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
 * Read session ID from .swagger-mcp config file
 */
async function readSessionFromConfig(swaggerFilePath: string): Promise<string | null> {
  try {
    const configPath = path.join(path.dirname(swaggerFilePath), '.swagger-mcp');
    const configContent = await fs.readFile(configPath, 'utf-8');

    // Try to find SWAGGER_SESSION_ID
    const sessionMatch = configContent.match(/SWAGGER_SESSION_ID=([^\s\n]+)/);
    if (sessionMatch) {
      return sessionMatch[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Derive session ID from file path (legacy support)
 */
function deriveSessionIdFromPath(filePath: string): string {
  const crypto = require('crypto');
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
 * Fallback to file-based endpoint listing (original implementation)
 */
async function listEndpointsFromFile(swaggerFilePath: string): Promise<any[]> {
  const swaggerContent = await fs.readFile(swaggerFilePath, 'utf8');
  const swaggerJson = JSON.parse(swaggerContent);
  const paths = swaggerJson.paths || {};

  const endpoints: any[] = [];

  for (const path in paths) {
    const pathItem = paths[path];

    for (const method in pathItem) {
      if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
        const operation = pathItem[method];

        endpoints.push({
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

  return endpoints;
}

/**
 * Adapter handler for listEndpoints
 */
export async function handleListEndpointsAdapter(input: {
  swaggerFilePath: string;
  useSearch?: boolean;
}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const startTime = Date.now();

  try {
    logger.info(`listEndpoints adapter called for ${input.swaggerFilePath}`);

    const { swaggerFilePath, useSearch = true } = input;

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

          // Use search with wildcard pattern to get all endpoints
          const result = await getSearchTool().searchEndpoints({
            swagger_url: url,
            session_id: sessionId,
            search_type: 'pattern',
            query: '*', // Match all
            limit: 10000 // Large limit to get all endpoints
          });

          const duration = Date.now() - startTime;

          // Format results similar to original tool
          const endpoints = result.results.map(r => ({
            path: r.path,
            method: r.method,
            description: r.description
          }));

          const responseText = `✅ **Endpoints Listed Successfully (via Search)**

**Source:** ${result.api_info.title} v${result.api_info.version}
**Total Endpoints:** ${result.total_found}
**Search Time:** ${result.search_time_ms}ms

**Endpoints:**
${JSON.stringify(endpoints, null, 2)}

**Performance:** ${duration}ms`;

          return {
            content: [{ type: 'text', text: responseText }]
          };
        }
      }
    }

    // Fall back to file-based approach
    logger.info(`Falling back to file-based endpoint listing`);

    const endpoints = await listEndpointsFromFile(swaggerFilePath);
    const duration = Date.now() - startTime;

    const responseText = `✅ **Endpoints Listed Successfully (via File)**

**Total Endpoints:** ${endpoints.length}
**Source:** File
**Load Time:** ${duration}ms

**Endpoints:**
${JSON.stringify(endpoints, null, 2)}

**Note:** Using file-based approach. For better performance and auto-refresh,
consider using the session-based tools instead.`;

    return {
      content: [{ type: 'text', text: responseText }]
    };

  } catch (error: any) {
    logger.error(`listEndpoints adapter error: ${error.message}`);

    // Try fallback to file-based approach on error
    try {
      const endpoints = await listEndpointsFromFile(input.swaggerFilePath);
      const duration = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: `⚠️ **Endpoints Listed (Fallback Mode)**

**Total Endpoints:** ${endpoints.length}
**Load Time:** ${duration}ms

**Endpoints:**
${JSON.stringify(endpoints, null, 2)}

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
