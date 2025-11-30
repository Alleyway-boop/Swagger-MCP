import { SwaggerSearchTool } from '../search/SwaggerSearchTool.js';
import logger from '../utils/logger.js';

function getSearchTool(): SwaggerSearchTool {
  const { SwaggerSearchTool } = require('../search/SwaggerSearchTool.js');
  if (!(global as any).searchToolInstance) {
    (global as any).searchToolInstance = new SwaggerSearchTool();
  }
  return (global as any).searchToolInstance;
}

// Tool definition for session statistics
export const getSessionStatsTool = {
  name: "get_session_stats",
  description: "Get detailed statistics and information about a configured session",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Session identifier to get statistics for"
      }
    },
    required: ["session_id"]
  }
};

// Tool definition for clearing cache
export const clearCacheTool = {
  name: "clear_swagger_cache",
  description: "Clear cached data for specific URLs or all cache entries to free memory",
  inputSchema: {
    type: "object",
    properties: {
      swagger_url: {
        type: "string",
        description: "Specific Swagger URL to clear cache for (optional)"
      },
      session_id: {
        type: "string",
        description: "Session ID to clear cache for (optional, requires swagger_url)"
      }
    }
  }
};

// Tool definition for search suggestions
export const getSearchSuggestionsTool = {
  name: "get_search_suggestions",
  description: "Get search suggestions and popular endpoints for a Swagger API",
  inputSchema: {
    type: "object",
    properties: {
      swagger_url: {
        type: "string",
        description: "Swagger/OpenAPI documentation URL"
      },
      session_id: {
        type: "string",
        description: "Session identifier"
      },
      partial: {
        type: "string",
        description: "Partial search term to get suggestions for"
      },
      limit: {
        type: "number",
        description: "Maximum number of suggestions to return (default: 5)",
        default: 5
      }
    },
    required: ["swagger_url", "session_id", "partial"]
  }
};

// Handler for session statistics
export async function handleGetSessionStats(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Session stats request`, { sessionId: input.session_id });

    const result = await getSearchTool().getSessionStats(input.session_id);

    let responseText = `📊 **Session Statistics**

**Session Information:**`;

    if (result.session_info) {
      const session = result.session_info;
      const lastAccessed = new Date(session.last_accessed).toLocaleString();
      const createdAt = new Date(session.created_at).toLocaleString();

      responseText += `
- **Session ID:** \`${session.id}\`
- **Status:** ${session.is_active ? '🟢 Active' : '🔴 Inactive'}
- **Swagger URLs:** ${session.swagger_urls.length}
- **Cache TTL:** ${Math.round(session.cache_ttl / 1000)} seconds
- **Created:** ${createdAt}
- **Last Accessed:** ${lastAccessed}

**Configured URLs:**`;
      session.swagger_urls.forEach((url, index) => {
        responseText += `\n${index + 1}. ${url}`;
      });
    } else {
      responseText += `
❌ **Session not found** - Session ID \`${input.session_id}\` does not exist or has expired.

**Solutions:**
- Create a new session with \`configure_swagger_session\`
- Check if the session ID is correct
- Verify the session hasn't expired`;
    }

    responseText += `

**Cache Statistics:**
- **Index Cache Size:** ${result.cache_stats.index_cache_size} entries
- **Memory Usage:** ${result.cache_stats.memory_usage_mb.toFixed(2)} MB
- **Hit Rate:** ${(result.cache_stats.hit_rate * 100).toFixed(1)}%

**System Statistics:**
- **Active Sessions:** ${result.system_stats.active_sessions}
- **Total Sessions:** ${result.system_stats.total_sessions}
- **System Memory:** ${result.system_stats.memory_usage_mb.toFixed(2)} MB

**Recommendations:**`;

    if (result.cache_stats.hit_rate < 0.5) {
      responseText += `\n- Consider increasing cache TTL for better hit rate`;
    }
    if (result.system_stats.memory_usage_mb > 400) {
      responseText += `\n- Memory usage is high, consider clearing cache with \`clear_swagger_cache\``;
    }
    if (result.system_stats.active_sessions > 50) {
      responseText += `\n- Many active sessions, consider cleaning up old sessions`;
    }
    if (result.cache_stats.hit_rate >= 0.5 && result.system_stats.memory_usage_mb < 400) {
      responseText += `\n- ✅ Performance looks good!`;
    }

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Get session stats failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Failed to Get Session Statistics**

Error: ${error.message}

**Troubleshooting:**
- Verify the session_id is correct
- Check if the session has expired
- Try creating a new session`
      }]
    };
  }
}

// Handler for clearing cache
export async function handleClearCache(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Clear cache request`, {
      swaggerUrl: input.swagger_url || 'all',
      sessionId: input.session_id || 'all'
    });

    const result = await getSearchTool().clearCache(input.swagger_url, input.session_id);

    const responseText = `🧹 **Cache Cleared Successfully**

**Cleared Items:** ${result.cleared_items}
**Cache Type:** ${result.cache_type === 'specific' ? 'Specific URL/Session' : 'All Caches'}

${result.cache_type === 'specific'
  ? `Cleared cache for:\n- Swagger URL: ${input.swagger_url}\n- Session ID: ${input.session_id}`
  : 'All cached data has been cleared to free memory'
}

**Benefits:**
- Reduced memory usage
- Fresh data on next search
- Resolved potential cache issues

**Next Steps:**
- Use \`search_swagger_endpoints\` to rebuild indexes as needed
- Check session stats with \`get_session_stats\``;

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Clear cache failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Failed to Clear Cache**

Error: ${error.message}

**Troubleshooting:**
- If clearing specific cache, ensure both swagger_url and session_id are provided
- Try clearing all caches if specific clear fails
- Check system permissions for cache directory`
      }]
    };
  }
}

// Handler for search suggestions
export async function handleGetSearchSuggestions(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Search suggestions request`, {
      swaggerUrl: input.swagger_url,
      sessionId: input.session_id,
      partial: input.partial
    });

    const result = await getSearchTool().getSearchSuggestions(
      input.swagger_url,
      input.session_id,
      input.partial,
      input.limit || 5
    );

    let responseText = `💡 **Search Suggestions for "${input.partial}"**

**Path Suggestions:**`;

    if (result.suggestions.length === 0) {
      responseText += `\nNo path suggestions found for "${input.partial}"`;
    } else {
      result.suggestions.forEach((suggestion, index) => {
        responseText += `\n${index + 1}. \`${suggestion}\``;
      });
    }

    responseText += `\n\n**Popular Endpoints:**`;

    if (result.popular_endpoints.length === 0) {
      responseText += `\nNo popular endpoints found for this API`;
    } else {
      result.popular_endpoints.forEach((endpoint, index) => {
        const method = endpoint.method ? `**${endpoint.method}**` : '';
        responseText += `\n${index + 1}. ${method} \`${endpoint.path}\``;
        if (endpoint.description) {
          responseText += `\n   ${endpoint.description}`;
        }
      });
    }

    responseText += `\n\n---
**Usage:**
- Use these suggestions with \`search_swagger_endpoints\`
- Try different partial terms for more suggestions
- Popular endpoints are good starting points for API exploration`;

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Get search suggestions failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Failed to Get Search Suggestions**

Error: ${error.message}

**Troubleshooting:**
- Verify the session_id is configured with this swagger_url
- Check that the swagger_url is accessible
- Try a different partial search term
- Ensure the session hasn't expired`
      }]
    };
  }
}