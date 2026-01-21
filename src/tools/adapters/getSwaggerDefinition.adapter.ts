/**
 * getSwaggerDefinition Adapter
 *
 * Adapter that bridges the original file-based getSwaggerDefinition tool
 * to the new session-based infrastructure with ETag/Last-Modified support.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { handleDynamicSwaggerConfig } from '../dynamicSwaggerConfig.js';
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
 * Generate session ID from URL hash
 */
function generateSessionIdFromUrl(url: string): string {
  const urlHash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `session_${urlHash}`;
}

/**
 * Save swagger document to local file
 */
async function saveSwaggerDocument(url: string, saveLocation: string, customHeaders?: Record<string, string>): Promise<{
  filePath: string;
  data: any;
}> {
  const axios = (await import('axios')).default;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Swagger-MCP-Adapter/1.0.0',
      ...customHeaders
    },
    timeout: 30000
  });

  const data = response.data;

  // Validate Swagger/OpenAPI format
  if (!data.openapi && !data.swagger) {
    throw new Error('Invalid Swagger/OpenAPI document');
  }

  // Generate filename from URL hash
  const filename = crypto.createHash('sha256').update(url).digest('hex') + '.json';
  const filePath = path.join(saveLocation, filename);

  // Ensure directory exists
  await fs.mkdir(saveLocation, { recursive: true });

  // Save to file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  return { filePath, data };
}

/**
 * Create enhanced .swagger-mcp config file
 */
async function createSwaggerMcpConfig(
  location: string,
  sessionId: string,
  url: string,
  cacheTTL?: number
): Promise<void> {
  const configPath = path.join(location, '.swagger-mcp');

  const configLines = [
    `# Swagger MCP Configuration`,
    `# Generated: ${new Date().toISOString()}`,
    `# Auto-managed session - do not edit manually`,
    ``,
    `SWAGGER_SESSION_ID=${sessionId}`,
    `SWAGGER_URL=${url}`,
    cacheTTL ? `CACHE_TTL=${cacheTTL}` : '',
    ``,
    `# Legacy file path (for backward compatibility)`,
    `# SWAGGER_FILEPATH=<will-be-set-on-first-use>`
  ].filter(Boolean).join('\n');

  await fs.writeFile(configPath, configLines);
  logger.info(`Created .swagger-mcp config at ${configPath}`);
}

/**
 * Adapter handler for getSwaggerDefinition
 */
export async function handleGetSwaggerDefinitionAdapter(input: {
  url: string;
  saveLocation: string;
  autoSession?: boolean;
  sessionConfig?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
  };
}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`getSwaggerDefinition adapter called for ${input.url}`);

    const {
      url,
      saveLocation,
      autoSession = true,
      sessionConfig = {}
    } = input;

    // Generate session ID from URL
    const sessionId = generateSessionIdFromUrl(url);

    // Configure session with improved tool
    if (autoSession) {
      await handleDynamicSwaggerConfig({
        session_id: sessionId,
        swagger_urls: [url],
        custom_headers: sessionConfig.custom_headers,
        cache_ttl: sessionConfig.cache_ttl || 600000 // 10 minutes default
      });

      logger.info(`Auto-configured session ${sessionId} for ${url}`);
    }

    // Save swagger document to local file (for backward compatibility)
    const { filePath } = await saveSwaggerDocument(
      url,
      saveLocation,
      sessionConfig.custom_headers
    );

    // Create .swagger-mcp config file
    await createSwaggerMcpConfig(
      saveLocation,
      sessionId,
      url,
      sessionConfig.cache_ttl || 600000
    );

    const responseText = `✅ **Swagger Definition Configured Successfully**

**File Location:** \`${filePath}\`

**Session Information:**
- Session ID: \`${sessionId}\`
- API URL: ${url}
- Auto-Refresh: Enabled
- Cache TTL: ${Math.round((sessionConfig.cache_ttl || 600000) / 1000)} seconds

**What's Next:**
1. Use \`search_swagger_endpoints\` with session_id="${sessionId}" to search endpoints
2. Use \`get_endpoint_details\` to get detailed endpoint information
3. The system will automatically detect and refresh when the API documentation changes

**Legacy Support:**
The original .swagger-mcp file has been created with the session information.
Original tools will work through the adapter layer.

**Advanced Options:**
- Check session status: \`get_session_stats\` with session_id="${sessionId}"
- Clear cache if needed: \`clear_swagger_cache\` with session_id="${sessionId}"`;

    return {
      content: [{ type: 'text', text: responseText }]
    };

  } catch (error: any) {
    logger.error(`getSwaggerDefinition adapter error: ${error.message}`);
    return {
      content: [{
        type: 'text',
        text: `❌ **Configuration Failed**

Error: ${error.message}

**Troubleshooting:**
- Verify the URL is accessible
- Check network connectivity
- Ensure saveLocation directory exists or can be created
- Try with different cache_ttl settings

**Original Tool Fallback:**
If the issue persists, you can use the original getSwaggerDefinition tool
which uses a simpler file-based approach.`
      }]
    };
  }
}

/**
 * Export the adapter for use in tools/index.ts
 */
export const getSwaggerDefinitionAdapter = {
  handler: handleGetSwaggerDefinitionAdapter
};
