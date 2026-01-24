/**
 * Transport Factory
 * Creates transport instances for MCP server communication
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Supported transport modes
 */
export type TransportMode = 'stdio' | 'sse' | 'http';

/**
 * Configuration for transport creation
 */
export interface TransportConfig {
  mode: TransportMode;
  port?: number;
  host?: string;
  path?: string;
}

/**
 * Create a transport instance based on the provided configuration
 * @param config The transport configuration
 * @returns A transport instance
 * @throws Error if transport mode is not supported or not yet implemented
 */
export function createTransport(config: TransportConfig): any {
  const { mode } = config;

  switch (mode) {
    case 'stdio':
      return new StdioServerTransport();

    case 'sse':
      // SSEServerTransport requires additional setup
      // Will need express/http server
      throw new Error('SSE transport not yet implemented - requires HTTP server setup');

    case 'http':
      // StreamableHTTP requires additional setup
      throw new Error('HTTP transport not yet implemented - requires HTTP server setup');

    default:
      throw new Error(`Unsupported transport mode: ${mode}`);
  }
}

/**
 * Get transport configuration from environment variables
 * @returns The transport configuration
 */
export function getTransportConfig(): TransportConfig {
  const mode = (process.env.TRANSPORT_MODE || 'stdio') as TransportMode;
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || 'localhost';
  const path = process.env.TRANSPORT_PATH || '/message';

  return { mode, port, host, path };
}

/**
 * Validate transport configuration
 * @param config The transport configuration to validate
 * @returns True if valid, false otherwise
 */
export function validateTransportConfig(config: TransportConfig): boolean {
  const validModes: TransportMode[] = ['stdio', 'sse', 'http'];

  if (!validModes.includes(config.mode)) {
    return false;
  }

  // For SSE and HTTP, port must be specified
  if ((config.mode === 'sse' || config.mode === 'http') &&
      (!config.port || config.port < 1 || config.port > 65535)) {
    return false;
  }

  return true;
}

/**
 * Check if a transport mode is currently supported
 * @param mode The transport mode to check
 * @returns True if supported, false otherwise
 */
export function isTransportModeSupported(mode: TransportMode): boolean {
  return mode === 'stdio';
}

/**
 * Get a list of all supported transport modes
 * @returns Array of supported transport modes
 */
export function getSupportedTransportModes(): TransportMode[] {
  return ['stdio'];
}

export default {
  createTransport,
  getTransportConfig,
  validateTransportConfig,
  isTransportModeSupported,
  getSupportedTransportModes
};
