/**
 * Adapters Index
 *
 * Exports all adapter implementations that bridge original tools
 * to the new session-based infrastructure.
 */

export {
  handleGetSwaggerDefinitionAdapter,
  getSwaggerDefinitionAdapter
} from './getSwaggerDefinition.adapter.js';

export {
  handleListEndpointsAdapter,
  listEndpointsAdapter
} from './listEndpoints.adapter.js';

export {
  handleListEndpointModelsAdapter,
  listEndpointModelsAdapter
} from './listEndpointModels.adapter.js';
