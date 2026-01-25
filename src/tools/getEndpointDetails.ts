import { GetEndpointDetailsParams } from '../search/SwaggerSearchTool.js';
import { SwaggerSearchTool } from '../search/SwaggerSearchTool.js';
import logger from '../utils/logger.js';

// Global search tool instance
let searchToolInstance: SwaggerSearchTool | null = null;

function getSearchTool(): SwaggerSearchTool {
  if (!searchToolInstance) {
    searchToolInstance = new SwaggerSearchTool();
  }
  return searchToolInstance;
}

// Tool definition for getting detailed endpoint information
export const getEndpointDetailsTool = {
  name: "get_endpoint_details",
  description: "Get detailed information for specific Swagger endpoints including parameters, responses, and schemas",
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
      endpoint_paths: {
        type: "array",
        items: { type: "string" },
        description: "List of endpoint paths to get details for"
      },
      methods: {
        type: "array",
        items: { type: "string" },
        description: "HTTP methods to include (default: ['GET'])",
        default: ["GET"]
      }
    },
    required: ["swagger_url", "session_id", "endpoint_paths"]
  }
};

// Tool handler
export async function handleGetEndpointDetails(input: any): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`Endpoint details request`, {
      swaggerUrl: input.swagger_url,
      sessionId: input.session_id,
      endpointCount: input.endpoint_paths?.length,
      methods: input.methods
    });

    const params: GetEndpointDetailsParams = {
      swagger_url: input.swagger_url,
      session_id: input.session_id,
      endpoint_paths: input.endpoint_paths,
      methods: input.methods || ["GET"]
    };

    const result = await getSearchTool().getEndpointDetails(params);

    let responseText = `📋 **Endpoint Details for ${input.swagger_url}**

**Performance:**
- Endpoints Loaded: ${result.endpoints.length}
- Load Time: ${result.load_time_ms}ms

---

**Detailed Endpoint Information:**`;

    if (result.endpoints.length === 0) {
      responseText += `\n\n❌ No endpoint details found.

**Possible Reasons:**
- Invalid endpoint paths
- HTTP methods not available for these paths
- Network issues accessing the API
- Authentication required`;
    } else {
      result.endpoints.forEach((endpoint, index) => {
        responseText += `\n\n${index + 1}. **${endpoint.method} ${endpoint.path}**`;

        const details = endpoint.details;

        // Basic information
        if (details.summary) {
          responseText += `\n   📝 **Summary:** ${details.summary}`;
        }

        if (details.description) {
          responseText += `\n   📄 **Description:** ${details.description}`;
        }

        if (details.operationId) {
          responseText += `\n   🔗 **Operation ID:** \`${details.operationId}\``;
        }

        if (details.tags && details.tags.length > 0) {
          responseText += `\n   🏷️ **Tags:** ${details.tags.join(', ')}`;
        }

        // Parameters
        if (details.parameters && details.parameters.length > 0) {
          responseText += `\n\n   📥 **Parameters:**`;
          details.parameters.forEach((param: any, paramIndex: number) => {
            const required = param.required ? ' (Required)' : ' (Optional)';
            const paramType = param.schema?.type || param.type || 'unknown';
            responseText += `\n   ${paramIndex + 1}. \`${param.name}\` - ${paramType}${required}`;
            if (param.description) {
              responseText += `\n      ${param.description}`;
            }
          });
        }

        // Request body
        if (details.requestBody) {
          responseText += `\n\n   📤 **Request Body:**`;
          const body = details.requestBody;
          if (body.description) {
            responseText += `\n   ${body.description}`;
          }
          if (body.content) {
            Object.keys(body.content).forEach(contentType => {
              responseText += `\n   - **Content Type:** ${contentType}`;
              if (body.content[contentType].schema) {
                responseText += `\n     **Schema:** ${JSON.stringify(body.content[contentType].schema, null, 2).substring(0, 200)}...`;
              }
            });
          }
        }

        // Responses
        if (details.responses && Object.keys(details.responses).length > 0) {
          responseText += `\n\n   📥 **Responses:**`;
          Object.entries(details.responses).forEach(([statusCode, responseInfo]: [string, any]) => {
            responseText += `\n   - **${statusCode}:** ${responseInfo.description || 'No description'}`;
            if (responseInfo.content) {
              Object.keys(responseInfo.content).forEach(contentType => {
                responseText += `\n     **Content:** ${contentType}`;
              });
            }
          });
        }

        responseText += '\n   ' + '─'.repeat(50);
      });

      responseText += `\n\n---
**Usage Tips:**
- Use these details to construct API calls
- Check required parameters before making requests
- Review response schemas for data structure
- Consider rate limiting for multiple endpoints`;
    }

    return {
      content: [{ type: "text", text: responseText }]
    };

  } catch (error: any) {
    logger.error(`Get endpoint details failed:`, error);
    return {
      content: [{
        type: "text",
        text: `❌ **Failed to Get Endpoint Details**

Error: ${error.message}

**Troubleshooting:**
- Verify session_id is properly configured
- Check that endpoint_paths are valid
- Ensure swagger_url is accessible
- Try with fewer endpoints at once
- Check if authentication is required`
      }]
    };
  }
}