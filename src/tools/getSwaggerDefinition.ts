/**
 * getSwaggerDefinition tool
 * Retrieves the Swagger definition
 * Enhanced with microservices detection, YAML support, and URL auto-detection
 */

import logger from "../utils/logger.js";
import swaggerService from "../services/index.js";
import { handleGetSwaggerDefinitionAdapter } from "./adapters/getSwaggerDefinition.adapter.js";

// Tool definition
export const getSwaggerDefinition = {
  name: "getSwaggerDefinition",
  description: "Fetches a Swagger/OpenAPI definition from a URL and saves it locally. Supports automatic detection of Swagger URLs, YAML format, and Spring Boot microservices architecture. For microservices, the tool will first return a list of available services when you provide the gateway URL without specifying a service. You can then specify the service name to get that specific service's documentation. The tool automatically creates the .claude/swagger-mcp.json configuration file required by all other Swagger-related tools.",
  inputSchema: {
    type: "object",
    properties: {
      // String parameters
      url: {
        type: "string",
        description: "The base URL of the API or Swagger definition. For microservices, use the gateway URL (e.g., https://api-gateway.example.com). The tool will automatically detect common Swagger paths like /swagger.json, /api-docs, /openapi.json, etc."
      },
      saveLocation: {
        type: "string",
        description: "The location where to save the Swagger definition file. This should be the current solution's root folder."
      },
      service: {
        type: "string",
        description: "Optional: The name of the microservice to fetch documentation for (only for Spring Boot microservices architecture). First call without this parameter to see available services, then call again with the desired service name."
      },
      autoDetect: {
        type: "boolean",
        description: "Optional: Enable automatic URL and microservices detection (default: true). Set to false to skip detection and use the exact URL provided."
      },
      autoSession: {
        type: "boolean",
        description: "Optional: Automatically create a session for the Swagger documentation (default: true)."
      },
      sessionConfig_cache_ttl: {
        type: "number",
        description: "Optional: Cache time-to-live in milliseconds (default: 600000 = 10 minutes)."
      },
      sessionConfig_custom_headers_Authorization: {
        type: "string",
        description: "Optional: Authorization header value (e.g., 'Bearer YOUR_TOKEN'). For other custom headers, use the sessionConfig directly."
      }
    },
    required: ["url", "saveLocation"]
  }
};

// Tool handler
export async function handleGetSwaggerDefinition(input: any) {
  logger.info('Calling handleGetSwaggerDefinition');
  logger.info(`Query parameters: ${JSON.stringify(input)}`);

  try {
    // 使用适配器处理新功能（微服务检测、YAML 支持、URL 自动检测）
    // 构建适配器所需的参数格式
    const adapterInput = {
      url: input.url,
      saveLocation: input.saveLocation,
      service: input.service,
      autoDetect: input.autoDetect !== false, // 默认为 true
      autoSession: input.autoSession !== false, // 默认为 true
      sessionConfig: {
        cache_ttl: input.sessionConfig_cache_ttl,
        custom_headers: input.sessionConfig_custom_headers_Authorization
          ? { Authorization: input.sessionConfig_custom_headers_Authorization }
          : input.sessionConfig_custom_headers
      }
    };

    // 调用适配器
    const result = await handleGetSwaggerDefinitionAdapter(adapterInput);

    logger.info(`Adapter response: ${JSON.stringify(result).substring(0, 200)}...`);

    return result;
  } catch (error: any) {
    logger.error(`Error in getSwaggerDefinition handler: ${error.message}`);
    return {
      content: [{
        type: "text",
        text: `Error retrieving swagger definition: ${error.message}`
      }]
    };
  }
} 