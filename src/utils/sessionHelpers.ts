/**
 * Session Helper Utilities
 *
 * Utilities for automatic session management and configuration handling.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { handleDynamicSwaggerConfig } from '../tools/dynamicSwaggerConfig.js';
import { getSessionConfigManager } from '../config/SessionConfigManager.js';
import logger from './logger.js';

/**
 * Generate session ID from URL
 */
export function generateSessionIdFromUrl(url: string): string {
  const urlHash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `session_${urlHash}`;
}

/**
 * Generate session ID from file path (legacy support)
 */
export function generateSessionIdFromPath(filePath: string): string {
  const pathHash = crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16);
  return `session_${pathHash}`;
}

/**
 * Auto-create session from URL with optional configuration
 */
export async function autoCreateSession(
  url: string,
  options?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
  }
): Promise<string> {
  const sessionId = generateSessionIdFromUrl(url);
  const sessionManager = getSessionConfigManager();

  // Check if session already exists
  const existing = sessionManager.getSession(sessionId);
  if (existing) {
    logger.debug(`Session ${sessionId} already exists, reusing`);
    return sessionId;
  }

  // Create new session
  logger.info(`Auto-creating session ${sessionId} for ${url}`);

  await handleDynamicSwaggerConfig({
    session_id: sessionId,
    swagger_urls: [url],
    cache_ttl: options?.cache_ttl || 600000, // 10 minutes default
    custom_headers: options?.custom_headers
  });

  return sessionId;
}

/**
 * Derive session ID from file path using .swagger-mcp config
 */
export async function deriveSessionFromFile(filePath: string): Promise<string | null> {
  try {
    const configPath = path.join(path.dirname(filePath), '.swagger-mcp');
    const configContent = await fs.readFile(configPath, 'utf-8');

    // Try to find SWAGGER_SESSION_ID (new format)
    const sessionMatch = configContent.match(/SWAGGER_SESSION_ID=([^\s\n]+)/);
    if (sessionMatch) {
      return sessionMatch[1].trim();
    }

    // Try to find SWAGGER_URL and derive session ID (legacy support)
    const urlMatch = configContent.match(/SWAGGER_URL=([^\s\n]+)/);
    if (urlMatch) {
      return generateSessionIdFromUrl(urlMatch[1].trim());
    }

    return null;
  } catch (error) {
    logger.debug(`Could not derive session from file: ${error}`);
    return null;
  }
}

/**
 * Read .swagger-mcp config file
 */
export async function readSwaggerMcpConfig(location: string): Promise<{
  sessionId?: string;
  url?: string;
  filePath?: string;
  cacheTTL?: number;
  customHeaders?: Record<string, string>;
} | null> {
  try {
    const configPath = path.join(location, '.swagger-mcp');
    const configContent = await fs.readFile(configPath, 'utf-8');

    const result: any = {};

    // Parse key-value pairs
    const lines = configContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();

      switch (key.trim()) {
        case 'SWAGGER_SESSION_ID':
          result.sessionId = value;
          break;
        case 'SWAGGER_URL':
          result.url = value;
          break;
        case 'SWAGGER_FILEPATH':
          result.filePath = value;
          break;
        case 'CACHE_TTL':
          result.cacheTTL = parseInt(value, 10);
          break;
        case 'CUSTOM_HEADERS':
          try {
            result.customHeaders = JSON.parse(value);
          } catch {
            logger.warn(`Failed to parse CUSTOM_HEADERS: ${value}`);
          }
          break;
      }
    }

    return result;
  } catch (error) {
    logger.debug(`Could not read .swagger-mcp config: ${error}`);
    return null;
  }
}

/**
 * Create or update .swagger-mcp config file
 */
export async function createSwaggerMcpConfig(
  location: string,
  sessionId: string,
  url?: string,
  options?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
    filePath?: string;
  }
): Promise<void> {
  const configPath = path.join(location, '.swagger-mcp');

  const lines = [
    `# Swagger MCP Configuration`,
    `# Generated: ${new Date().toISOString()}`,
    `# Auto-managed session - do not edit manually`,
    ``,
    `SWAGGER_SESSION_ID=${sessionId}`,
    url ? `SWAGGER_URL=${url}` : '',
    options?.cache_ttl ? `CACHE_TTL=${options.cache_ttl}` : '',
    options?.custom_headers ? `CUSTOM_HEADERS=${JSON.stringify(options.custom_headers)}` : '',
    ``,
    `# Legacy file path (for backward compatibility)`,
    options?.filePath ? `SWAGGER_FILEPATH=${options.filePath}` : `# SWAGGER_FILEPATH=<will-be-set-on-first-use>`
  ].filter(Boolean).join('\n');

  await fs.writeFile(configPath, lines);
  logger.info(`Created/updated .swagger-mcp config at ${configPath}`);
}

/**
 * Get URL from session
 */
export async function getUrlFromSession(sessionId: string): Promise<string | null> {
  const sessionManager = getSessionConfigManager();
  const session = sessionManager.getSession(sessionId);
  return session?.swaggerUrls?.[0] || null;
}

/**
 * Get or create session for a given URL
 */
export async function getOrCreateSession(
  url: string,
  options?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
  }
): Promise<{ sessionId: string; created: boolean }> {
  const sessionId = generateSessionIdFromUrl(url);
  const sessionManager = getSessionConfigManager();

  const existing = sessionManager.getSession(sessionId);
  if (existing) {
    return { sessionId, created: false };
  }

  await autoCreateSession(url, options);
  return { sessionId, created: true };
}

/**
 * Validate session exists and is active
 */
export function validateSession(sessionId: string): boolean {
  const sessionManager = getSessionConfigManager();
  const session = sessionManager.getSession(sessionId);
  return session !== null && session.isActive;
}

/**
 * List all active sessions
 */
export function listActiveSessions(): Array<{
  id: string;
  urls: string[];
  createdAt: number;
  lastAccessed: number;
}> {
  const sessionManager = getSessionConfigManager();

  // Get all sessions by iterating through stored sessions
  const sessions: Array<{
    id: string;
    urls: string[];
    createdAt: number;
    lastAccessed: number;
  }> = [];

  // Note: SessionConfigManager doesn't expose a list of all session IDs directly
  // This is a limitation that would require adding a getAllSessions() method
  // For now, return empty array as placeholder

  return sessions;
}
