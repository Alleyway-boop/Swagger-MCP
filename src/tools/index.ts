/**
 * Tools index file
 * Exports all tool definitions and implementations
 * Includes both original and new improved tools
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

// Original tool definitions array
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

// All tool definitions (both original and improved)
export const toolDefinitions = [
  ...originalToolDefinitions,
  ...improvedToolDefinitions
];

// Export original tool handlers
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
