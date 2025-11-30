import { ConfigureSessionParams } from '../search/SwaggerSearchTool.js';
import { SwaggerSearchTool } from '../search/SwaggerSearchTool.js';
import logger from '../utils/logger.js';

// Global search tool instance
let searchTool: SwaggerSearchTool | null = null;

function getSearchTool(): SwaggerSearchTool {
  if (!searchTool) {
    searchTool = new SwaggerSearchTool();
  }
  return searchTool;
}

// Tool definition for dynamic swagger configuration
export const dynamicSwaggerConfigTool = {
  name: "configure_swagger_session",
  description: "Configure a dynamic session for Swagger API interactions with custom settings and caching",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Unique identifier for the session"
      },
      swagger_urls: {
        type: "array",
        items: { type: "string" },
        description: "List of Swagger/OpenAPI documentation URLs"
      },
      custom_headers: {
        type: "object",
        description: "Custom headers to include in API requests (e.g., Authorization tokens)"
      },
      cache_ttl: {
        type: "number",
        description: "Cache time-to-live in milliseconds (default: 10 minutes)",
        default: 600000
      },
      rate_limit: {
        type: "object",
        properties: {
          requests_per_second: { type: "number", description: "Maximum requests per second" },
          burst_size: { type: "number", description: "Maximum burst size" }
        },
        description: "Rate limiting configuration"
      }
    },
    required: ["session_id", "swagger_urls"]
  }
};

// Tool handler
export async function handleDynamicSwaggerConfig(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Dynamic swagger configuration request received`, {
      sessionId: input.session_id,
      urlCount: input.swagger_urls?.length
    });

    const params: ConfigureSessionParams = {
      session_id: input.session_id,
      swagger_urls: input.swagger_urls,
      custom_headers: input.custom_headers,
      cache_ttl: input.cache_ttl,
      rate_limit: input.rate_limit ? {
        requests_per_second: input.rate_limit.requests_per_second,
        burst_size: input.rate_limit.burst_size
      } : undefined
    };

    const result = await getSearchTool().configureSession(params);

    const responseText = `✅ **Swagger Session Configured Successfully**

**Session Details:**
- Session ID: \`${result.session_id}\`
- Status: ${result.status}
- Configured URLs: ${result.swagger_urls_configured}
- Cache TTL: ${Math.round(result.cache_ttl / 1000)} seconds

**Usage Examples:**
1. Search endpoints: \`search_swagger_endpoints\`
2. Get endpoint details: \`get_endpoint_details\`
3. Check session stats: \`get_session_stats\`

**Next Steps:**
Use the session ID with other search tools to efficiently explore the API without loading full documentation.`;

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Dynamic swagger configuration failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Configuration Failed**

Error: ${error.message}

**Troubleshooting:**
- Verify session_id is unique and valid
- Check swagger_urls are accessible
- Ensure custom_headers format is correct
- Try with fewer URLs first`
      }]
    };
  }
}