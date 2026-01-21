/**
 * Unified Swagger Tool
 *
 * A single, unified tool that handles all Swagger operations
 * with automatic session management.
 */

import { handleDynamicSwaggerConfig } from './dynamicSwaggerConfig.js';
import { handleSearchSwaggerEndpoints } from './searchSwaggerEndpoints.js';
import { handleGetEndpointDetails } from './getEndpointDetails.js';
import { handleGetSessionStats } from './sessionManagement.js';
import { handleClearCache } from './sessionManagement.js';
import { handleGetSearchSuggestions } from './sessionManagement.js';
import { handleGetSwaggerDefinitionAdapter } from './adapters/getSwaggerDefinition.adapter.js';
import { handleListEndpointsAdapter } from './adapters/listEndpoints.adapter.js';
import { handleListEndpointModelsAdapter } from './adapters/listEndpointModels.adapter.js';
import {
  autoCreateSession,
  getOrCreateSession,
  getUrlFromSession
} from '../utils/sessionHelpers.js';
import { generateModelCode } from './generateModelCode.js';
import { generateEndpointToolCode } from './generateEndpointToolCode.js';
import logger from '../utils/logger.js';

/**
 * Unified tool definition
 */
export const unifiedSwaggerTool = {
  name: 'swagger_explorer',
  description: `Unified tool for all Swagger operations with automatic session management.

Operations:
- configure: Set up API session with auto-refresh
- search: Fast endpoint search without full document load
- details: Get detailed endpoint information
- list: List all endpoints
- download: Download and save Swagger document
- models: Get models used by an endpoint
- generate_model: Generate TypeScript code for a model
- generate_tool: Generate MCP tool code for an endpoint
- stats: Get session statistics
- suggestions: Get search suggestions
- clear_cache: Clear cached data

The tool automatically manages sessions - just provide the URL and it will handle the rest.`,
  inputSchema: {
    type: 'object',
    properties: {
      // Operation selector
      operation: {
        type: 'string',
        enum: [
          'configure',
          'search',
          'details',
          'list',
          'download',
          'models',
          'generate_model',
          'generate_tool',
          'stats',
          'suggestions',
          'clear_cache'
        ],
        description: 'Operation to perform'
      },
      // Common parameters
      url: {
        type: 'string',
        description: 'Swagger/OpenAPI documentation URL (for configure, download, auto-session creation)'
      },
      session_id: {
        type: 'string',
        description: 'Session ID (auto-created from URL if not provided)'
      },
      save_location: {
        type: 'string',
        description: 'Local directory to save files (for download)'
      },
      // Search parameters
      query: {
        type: 'string',
        description: 'Search query (for search, suggestions)'
      },
      search_type: {
        type: 'string',
        enum: ['keywords', 'tags', 'pattern'],
        description: 'Search type: keywords, tags, or pattern matching'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return'
      },
      methods: {
        type: 'array',
        items: { type: 'string' },
        description: 'HTTP methods to filter by (e.g., ["GET", "POST"])'
      },
      // Endpoint details parameters
      endpoint_paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Endpoint paths to get details for (for details, models, generate_tool)'
      },
      // Model generation parameters
      model_name: {
        type: 'string',
        description: 'Model name to generate code for (for generate_model)'
      },
      // Session configuration
      cache_ttl: {
        type: 'number',
        description: 'Cache time-to-live in milliseconds (default: 600000 = 10 minutes)'
      },
      custom_headers: {
        type: 'object',
        description: 'Custom HTTP headers (e.g., {"Authorization": "Bearer token"})'
      }
    },
    required: ['operation']
  }
};

/**
 * Main handler for unified tool
 */
export async function handleUnifiedSwagger(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const { operation, ...params } = input;

  try {
    logger.info(`Unified swagger operation: ${operation}`);

    // Auto-create session if URL provided but no session_id
    if (params.url && !params.session_id &&
        ['search', 'details', 'list', 'models', 'suggestions'].includes(operation)) {
      const { sessionId } = await getOrCreateSession(
        params.url,
        {
          cache_ttl: params.cache_ttl,
          custom_headers: params.custom_headers
        }
      );
      params.session_id = sessionId;
      logger.info(`Auto-created session ${sessionId} for ${params.url}`);
    }

    // Route to appropriate handler
    switch (operation) {
      case 'configure': {
        return await handleDynamicSwaggerConfig({
          session_id: params.session_id,
          swagger_urls: params.url ? [params.url] : params.swagger_urls,
          custom_headers: params.custom_headers,
          cache_ttl: params.cache_ttl
        });
      }

      case 'search': {
        if (!params.session_id) {
          throw new Error('session_id is required for search. Provide url to auto-create session.');
        }
        const swagger_url = params.url || await getUrlFromSession(params.session_id);
        if (!swagger_url) {
          throw new Error('Could not determine Swagger URL from session. Provide url parameter.');
        }

        return await handleSearchSwaggerEndpoints({
          swagger_url,
          session_id: params.session_id,
          search_type: params.search_type || 'keywords',
          query: params.query || '*',
          methods: params.methods,
          limit: params.limit || 20
        });
      }

      case 'details': {
        if (!params.session_id) {
          throw new Error('session_id is required for details. Provide url to auto-create session.');
        }
        const swagger_url = params.url || await getUrlFromSession(params.session_id);
        if (!swagger_url) {
          throw new Error('Could not determine Swagger URL from session.');
        }

        return await handleGetEndpointDetails({
          swagger_url,
          session_id: params.session_id,
          endpoint_paths: params.endpoint_paths || [],
          methods: params.methods
        });
      }

      case 'list': {
        if (!params.save_location) {
          throw new Error('save_location is required for list operation');
        }
        // For list, we need the swagger file path - use session to derive it
        return await handleListEndpointsAdapter({
          swaggerFilePath: params.save_location + '/swagger.json', // Will be derived from session
          useSearch: true
        });
      }

      case 'download': {
        if (!params.url || !params.save_location) {
          throw new Error('url and save_location are required for download');
        }
        return await handleGetSwaggerDefinitionAdapter({
          url: params.url,
          saveLocation: params.save_location,
          autoSession: true,
          sessionConfig: {
            cache_ttl: params.cache_ttl,
            custom_headers: params.custom_headers
          }
        });
      }

      case 'models': {
        if (!params.session_id && !params.swaggerFilePath) {
          throw new Error('Either session_id (with url) or swaggerFilePath is required');
        }

        if (params.session_id) {
          const swagger_url = params.url || await getUrlFromSession(params.session_id);
          if (!swagger_url) {
            throw new Error('Could not determine Swagger URL from session.');
          }

          // Use details operation and extract models
          const result = await handleGetEndpointDetails({
            swagger_url,
            session_id: params.session_id,
            endpoint_paths: params.endpoint_paths || [],
            methods: params.methods
          });

          // Extract models from the response
          const models = extractModelsFromEndpointDetails(result);
          return {
            content: [{
              type: 'text',
              text: `**Models Found:**\n\n${models.map(m => `- \`${m}\``).join('\n')}`
            }]
          };
        }

        // Fall back to adapter
        return await handleListEndpointModelsAdapter({
          swaggerFilePath: params.swaggerFilePath,
          path: params.endpoint_paths?.[0],
          method: params.methods?.[0] || 'GET'
        });
      }

      case 'generate_model': {
        if (!params.model_name || !params.swaggerFilePath) {
          throw new Error('model_name and swaggerFilePath are required for generate_model');
        }
        return await handleGenerateModelCode({
          swaggerFilePath: params.swaggerFilePath,
          modelName: params.model_name
        });
      }

      case 'generate_tool': {
        if (!params.swaggerFilePath) {
          throw new Error('swaggerFilePath is required for generate_tool');
        }
        return await handleGenerateEndpointToolCode({
          swaggerFilePath: params.swaggerFilePath,
          path: params.endpoint_paths?.[0],
          method: params.methods?.[0] || 'GET'
        });
      }

      case 'stats': {
        if (!params.session_id) {
          throw new Error('session_id is required for stats');
        }
        return await handleGetSessionStats({ session_id: params.session_id });
      }

      case 'suggestions': {
        if (!params.session_id) {
          throw new Error('session_id is required for suggestions');
        }
        const swagger_url = params.url || await getUrlFromSession(params.session_id);
        if (!swagger_url) {
          throw new Error('Could not determine Swagger URL from session.');
        }

        return await handleGetSearchSuggestions({
          swagger_url,
          session_id: params.session_id,
          partial: params.query || '',
          limit: params.limit || 5
        });
      }

      case 'clear_cache': {
        if (!params.session_id && !params.url) {
          throw new Error('Either session_id or url is required for clear_cache');
        }
        const swagger_url = params.url || await getUrlFromSession(params.session_id || '');
        return await handleClearCache({
          swagger_url,
          session_id: params.session_id
        });
      }

      default:
        return {
          content: [{
            type: 'text',
            text: `❌ Unknown operation: ${operation}

Valid operations are:
- configure: Set up API session
- search: Search endpoints
- details: Get endpoint details
- list: List all endpoints
- download: Download Swagger document
- models: Get endpoint models
- generate_model: Generate model code
- generate_tool: Generate tool code
- stats: Session statistics
- suggestions: Search suggestions
- clear_cache: Clear cache`
          }]
        };
    }
  } catch (error: any) {
    logger.error(`Unified swagger operation error: ${error.message}`);
    return {
      content: [{
        type: 'text',
        text: `❌ **Operation Failed**

Operation: ${operation}
Error: ${error.message}

**Troubleshooting:**
- Check that all required parameters are provided
- Verify the URL is accessible
- Ensure session is configured (try 'configure' operation first)`
      }]
    };
  }
}

/**
 * Helper: Extract model names from endpoint details
 */
function extractModelsFromEndpointDetails(result: any): string[] {
  const models = new Set<string>();

  for (const endpoint of result.content?.[0]?.endpoints || []) {
    const details = endpoint.details;

    // Check parameters
    if (details.parameters) {
      for (const param of details.parameters) {
        if (param.schema?.$ref) {
          const ref = param.schema.$ref;
          if (ref.includes('/schemas/')) {
            models.add(ref.split('/').pop());
          }
        }
      }
    }

    // Check request body
    if (details.requestBody?.content) {
      for (const content of Object.values(details.requestBody.content)) {
        if ((content as any).schema?.$ref) {
          const ref = (content as any).schema.$ref;
          if (ref.includes('/schemas/')) {
            models.add(ref.split('/').pop());
          }
        }
      }
    }

    // Check responses
    if (details.responses) {
      for (const response of Object.values(details.responses)) {
        if ((response as any).content) {
          for (const content of Object.values((response as any).content)) {
            if ((content as any).schema?.$ref) {
              const ref = (content as any).schema.$ref;
              if (ref.includes('/schemas/')) {
                models.add(ref.split('/').pop());
              }
            }
          }
        }
      }
    }
  }

  return Array.from(models);
}

/**
 * Wrapper handlers for backward compatibility
 */
async function handleGenerateModelCode(input: any) {
  // Import and call original handler
  const { handleGenerateModelCode } = await import('./generateModelCode.js');
  return handleGenerateModelCode(input);
}

async function handleGenerateEndpointToolCode(input: any) {
  // Import and call original handler
  const { handleGenerateEndpointToolCode } = await import('./generateEndpointToolCode.js');
  return handleGenerateEndpointToolCode(input);
}
