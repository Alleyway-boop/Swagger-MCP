/**
 * listEndpointModels Adapter
 *
 * Adapter that bridges the original listEndpointModels tool
 * to use the new get_endpoint_details infrastructure.
 */

import fs from 'fs/promises';
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
    const path = require('path');
    const fs = require('fs/promises');
    const configPath = path.join(path.dirname(swaggerFilePath), '.swagger-mcp');
    const configContent = await fs.readFile(configPath, 'utf-8');

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
 * Get URL from session
 */
async function getUrlFromSession(sessionId: string): Promise<string | null> {
  const sessionManager = getSessionConfigManager();
  const session = sessionManager.getSession(sessionId);
  return session?.swaggerUrls?.[0] || null;
}

/**
 * Extract models from endpoint details
 */
function extractModelsFromDetails(details: any): string[] {
  const models = new Set<string>();

  // Extract from parameters
  if (details.parameters) {
    for (const param of details.parameters) {
      if (param.schema) {
        extractModelsFromSchema(param.schema, models);
      }
    }
  }

  // Extract from request body
  if (details.requestBody) {
    const content = details.requestBody.content;
    if (content) {
      for (const contentType of Object.values(content)) {
        if ((contentType as any).schema) {
          extractModelsFromSchema((contentType as any).schema, models);
        }
      }
    }
  }

  // Extract from responses
  if (details.responses) {
    for (const response of Object.values(details.responses)) {
      const content = (response as any).content;
      if (content) {
        for (const contentType of Object.values(content)) {
          if ((contentType as any).schema) {
            extractModelsFromSchema((contentType as any).schema, models);
          }
        }
      }
    }
  }

  return Array.from(models);
}

/**
 * Recursively extract model references from schema
 */
function extractModelsFromSchema(schema: any, models: Set<string>): void {
  if (!schema) return;

  // $ref directly references a model
  if (schema.$ref) {
    const ref = schema.$ref;
    if (ref.startsWith('#/components/schemas/')) {
      models.add(ref.replace('#/components/schemas/', ''));
    } else if (ref.startsWith('#/definitions/')) {
      models.add(ref.replace('#/definitions/', ''));
    }
  }

  // array items
  if (schema.items) {
    extractModelsFromSchema(schema.items, models);
  }

  // object properties
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      extractModelsFromSchema(prop, models);
    }
  }

  // allOf, anyOf, oneOf
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (schema[key]) {
      for (const subSchema of schema[key]) {
        extractModelsFromSchema(subSchema, models);
      }
    }
  }
}

/**
 * Fallback to file-based model listing
 */
async function listModelsFromFile(swaggerFilePath: string, endpointPath: string, method: string): Promise<string[]> {
  const swaggerContent = await fs.readFile(swaggerFilePath, 'utf8');
  const swaggerJson = JSON.parse(swaggerContent);

  const pathItem = swaggerJson.paths[endpointPath];
  if (!pathItem) {
    throw new Error(`Endpoint ${endpointPath} not found`);
  }

  const operation = pathItem[method.toLowerCase()];
  if (!operation) {
    throw new Error(`Method ${method} not found for endpoint ${endpointPath}`);
  }

  return extractModelsFromDetails(operation);
}

/**
 * Adapter handler for listEndpointModels
 */
export async function handleListEndpointModelsAdapter(input: {
  swaggerFilePath: string;
  path: string;
  method: string;
}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`listEndpointModels adapter called for ${input.path} ${input.method}`);

    const { swaggerFilePath, path, method } = input;

    // Try to use session-based approach first
    const sessionId = await readSessionFromConfig(swaggerFilePath);

    if (sessionId) {
      const url = await getUrlFromSession(sessionId);

      if (url) {
        logger.info(`Using session-based endpoint details for ${url}`);

        const result = await getSearchTool().getEndpointDetails({
          swagger_url: url,
          session_id: sessionId,
          endpoint_paths: [path],
          methods: [method]
        });

        if (result.endpoints.length > 0) {
          const models = extractModelsFromDetails(result.endpoints[0].details);

          return {
            content: [{
              type: 'text',
              text: `✅ **Models for ${method.toUpperCase()} ${path}**

**Total Models:** ${models.length}
**Source:** Session-based (with auto-refresh)

**Models:**
${models.length > 0 ? models.map(m => `- \`${m}\``).join('\n') : '_No models found_'}

**Performance:** ${result.load_time_ms}ms`
            }]
          };
        }
      }
    }

    // Fall back to file-based approach
    logger.info(`Falling back to file-based model listing`);

    const models = await listModelsFromFile(swaggerFilePath, path, method);

    return {
      content: [{
        type: 'text',
        text: `✅ **Models for ${method.toUpperCase()} ${path}**

**Total Models:** ${models.length}
**Source:** File

**Models:**
${models.length > 0 ? models.map(m => `- \`${m}\``).join('\n') : '_No models found_'}

**Note:** Using file-based approach. For auto-refresh support,
consider using the session-based tools.`
      }]
    };

  } catch (error: any) {
    logger.error(`listEndpointModels adapter error: ${error.message}`);
    return {
      content: [{
        type: 'text',
        text: `❌ **Failed to List Models**

Error: ${error.message}

**Troubleshooting:**
- Verify the endpoint path and method are correct
- Check that the swagger file exists and is valid
- Ensure the endpoint is defined in the swagger document`
      }]
    };
  }
}

/**
 * Export the adapter for use in tools/index.ts
 */
export const listEndpointModelsAdapter = {
  handler: handleListEndpointModelsAdapter
};
