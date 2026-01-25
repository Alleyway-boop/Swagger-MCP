/**
 * listEndpoints tool
 * Lists all endpoints from the Swagger definition
 */

import logger from "../utils/logger.js";
import swaggerService from "../services/index.js";

// Tool definition
export const listEndpoints = {
  name: "listEndpoints",
  description: "Lists API endpoints from a Swagger definition with pagination support. Returns endpoint paths, methods, and metadata.",
  inputSchema: {
    type: "object",
    properties: {
      swaggerFilePath: {
        type: "string",
        description: "Path to the Swagger file saved by getSwaggerDefinition."
      },
      summary: {
        type: "boolean",
        description: "Compact mode (METHOD /path only). USE THIS FOR LARGE APIs to reduce token usage by 70-80%. For APIs with 100+ endpoints, always use summary=true or delegate to sub-agent."
      },
      limit: {
        type: "number",
        description: "Max endpoints to return (default: 50, max: 1000). Use pagination for large APIs instead of increasing limit."
      },
      offset: {
        type: "number",
        description: "Number of endpoints to skip for pagination (e.g., offset=50 for page 2)."
      }
    },
    required: ["swaggerFilePath"]
  }
};

// Tool handler
export async function handleListEndpoints(input: any) {
  logger.info('Calling swaggerService.listEndpoints()');
  logger.info(`Input parameters: ${JSON.stringify(input)}`);
  
  try {
    const endpoints = await swaggerService.listEndpoints(input);
    logger.info(`Endpoints response: ${JSON.stringify(endpoints).substring(0, 200)}...`);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(endpoints, null, 2)
      }]
    };
  } catch (error: any) {
    logger.error(`Error in listEndpoints handler: ${error.message}`);
    return {
      content: [{
        type: "text",
        text: `Error retrieving endpoints: ${error.message}`
      }]
    };
  }
} 