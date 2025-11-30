import { SearchSwaggerEndpointsParams } from '../search/SwaggerSearchTool.js';
import { SwaggerSearchTool } from '../search/SwaggerSearchTool.js';
import logger from '../utils/logger.js';

function getSearchTool(): SwaggerSearchTool {
  const { SwaggerSearchTool } = require('../search/SwaggerSearchTool.js');
  if (!(global as any).searchToolInstance) {
    (global as any).searchToolInstance = new SwaggerSearchTool();
  }
  return (global as any).searchToolInstance;
}

// Tool definition for efficient swagger endpoint search
export const searchSwaggerEndpointsTool = {
  name: "search_swagger_endpoints",
  description: "Efficiently search Swagger/OpenAPI endpoints by keywords, tags, or patterns without loading full documentation",
  inputSchema: {
    type: "object",
    properties: {
      swagger_url: {
        type: "string",
        description: "Swagger/OpenAPI documentation URL"
      },
      session_id: {
        type: "string",
        description: "Session identifier configured with swagger URLs"
      },
      search_type: {
        type: "string",
        enum: ["keywords", "tags", "pattern"],
        description: "Type of search to perform"
      },
      query: {
        type: "string",
        description: "Search query - keywords (space-separated), tags (comma-separated), or path pattern"
      },
      methods: {
        type: "array",
        items: { type: "string" },
        description: "Filter by HTTP methods (e.g., ['GET', 'POST'])"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 20)",
        default: 20
      }
    },
    required: ["swagger_url", "session_id", "search_type", "query"]
  }
};

// Tool handler
export async function handleSearchSwaggerEndpoints(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Swagger endpoint search request`, {
      swaggerUrl: input.swagger_url,
      sessionId: input.session_id,
      searchType: input.search_type,
      query: input.query
    });

    const params: SearchSwaggerEndpointsParams = {
      swagger_url: input.swagger_url,
      session_id: input.session_id,
      search_type: input.search_type,
      query: input.query,
      methods: input.methods,
      limit: input.limit || 20
    };

    const result = await getSearchTool().searchEndpoints(params);

    // Format results for display
    let responseText = `🔍 **Search Results for ${input.swagger_url}**

**API Information:**
- Title: ${result.api_info.title}
- Version: ${result.api_info.version}
- Total Endpoints: ${result.api_info.total_endpoints}
- Available Tags: ${result.api_info.tags.join(', ')}

**Search Performance:**
- Results Found: ${result.total_found}
- Search Time: ${result.search_time_ms}ms

---

**Endpoints Found: (${result.results.length} results)**`;

    if (result.results.length === 0) {
      responseText += `\n\n❌ No endpoints found matching your criteria.

**Suggestions:**
- Try different keywords or patterns
- Check spelling and syntax
- Use broader search terms
- Try searching by tags instead of keywords`;
    } else {
      result.results.forEach((endpoint, index) => {
        const method = endpoint.method ? `**${endpoint.method}**` : '';
        const relevance = Math.round(endpoint.relevance * 100);
        responseText += `\n\n${index + 1}. ${method} \`${endpoint.path}\` ${relevance}%`;

        if (endpoint.description) {
          const shortDesc = endpoint.description.length > 100
            ? endpoint.description.substring(0, 100) + '...'
            : endpoint.description;
          responseText += `\n   📝 ${shortDesc}`;
        }
      });

      responseText += `\n\n---
**Next Steps:**
- Use \`get_endpoint_details\` for complete endpoint information
- Try \`get_search_suggestions\` for related endpoints
- Configure caching with \`configure_swagger_session\``;
    }

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Swagger endpoint search failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Search Failed**

Error: ${error.message}

**Troubleshooting:**
- Verify the session_id is configured with this swagger_url
- Check that the swagger_url is accessible
- Ensure search_type is one of: keywords, tags, pattern
- Verify query format matches search_type`
      }]
    };
  }
}