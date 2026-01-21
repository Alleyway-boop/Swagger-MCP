/**
 * Tools index file
 * Exports all tool definitions and implementations
 * Includes original tools, improved tools, adapters, and unified tool
 */

import { getSwaggerDefinition } from './getSwaggerDefinition.js';
import { listEndpoints } from './listEndpoints.js';
import { listEndpointModels } from './listEndpointModels.js';
import { generateModelCode } from './generateModelCode.js';
import { generateEndpointToolCode } from './generateEndpointToolCode.js';

// New improved tools
import { dynamicSwaggerConfigTool, handleDynamicSwaggerConfig } from './dynamicSwaggerConfig.js';
import { searchSwaggerEndpointsTool, handleSearchSwaggerEndpoints } from './searchSwaggerEndpoints.js';
import { getEndpointDetailsTool, handleGetEndpointDetails } from './getEndpointDetails.js';
import {
  getSessionStatsTool,
  handleGetSessionStats,
  clearCacheTool,
  handleClearCache,
  getSearchSuggestionsTool,
  handleGetSearchSuggestions
} from './sessionManagement.js';

// Adapters and unified tool
import { unifiedSwaggerTool, handleUnifiedSwagger } from './unifiedSwaggerTool.js';
import {
  handleGetSwaggerDefinitionAdapter,
  handleListEndpointsAdapter,
  handleListEndpointModelsAdapter
} from './adapters/index.js';

// Original tool definitions array (kept for backward compatibility)
export const originalToolDefinitions = [
  getSwaggerDefinition,
  listEndpoints,
  listEndpointModels,
  generateModelCode,
  generateEndpointToolCode
];

// New improved tool definitions array
export const improvedToolDefinitions = [
  dynamicSwaggerConfigTool,
  searchSwaggerEndpointsTool,
  getEndpointDetailsTool,
  getSessionStatsTool,
  clearCacheTool,
  getSearchSuggestionsTool
];

// Unified tool definition (recommended for new usage)
export const unifiedToolDefinition = unifiedSwaggerTool;

// All tool definitions (original, improved, and unified)
export const toolDefinitions = [
  ...originalToolDefinitions,
  ...improvedToolDefinitions,
  unifiedSwaggerTool  // Add unified tool to the list
];

// Export original tool handlers (for backward compatibility)
export { handleGetSwaggerDefinition } from './getSwaggerDefinition.js';
export { handleListEndpoints } from './listEndpoints.js';
export { handleListEndpointModels } from './listEndpointModels.js';
export { handleGenerateModelCode } from './generateModelCode.js';
export { handleGenerateEndpointToolCode } from './generateEndpointToolCode.js';

// Export new improved tool handlers
export {
  handleDynamicSwaggerConfig,
  handleSearchSwaggerEndpoints,
  handleGetEndpointDetails,
  handleGetSessionStats,
  handleClearCache,
  handleGetSearchSuggestions
};

// Export adapter handlers (internal use)
export {
  handleGetSwaggerDefinitionAdapter,
  handleListEndpointsAdapter,
  handleListEndpointModelsAdapter
};

// Export unified tool handler
export { handleUnifiedSwagger };
