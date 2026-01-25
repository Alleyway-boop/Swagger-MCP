/**
 * Swagger URL 自动检测工具
 * 自动发现 Swagger/OpenAPI 文档 URL
 */

import axios from 'axios';
import logger from './logger.js';

// 常见 Swagger 路径模式（按优先级排序）
const COMMON_SWAGGER_PATHS = [
  // Swagger 2.0 标准 - 最常见
  '/swagger.json',
  '/swagger.yaml',
  '/swagger.yml',

  // OpenAPI 3.0 标准
  '/openapi.json',
  '/openapi.yaml',
  '/openapi.yml',

  // API 文档门户
  '/api-docs',
  '/api-docs/swagger.json',
  '/api-docs/openapi.json',

  // 版本化路径 - v2（常见于旧版 Swagger）
  '/v2/swagger.json',
  '/v2/swagger.yaml',
  '/v2/openapi.json',
  '/api/v2/swagger.json',
  '/api/v2/swagger.yaml',
  '/api/v2/openapi.json',

  // 版本化路径 - v1
  '/v1/swagger.json',
  '/v1/openapi.json',
  '/api/v1/swagger.json',
  '/api/v1/openapi.json',

  // 版本化路径 - v3
  '/v3/swagger.json',
  '/v3/openapi.json',
  '/api/v3/swagger.json',
  '/api/v3/openapi.json',

  // 版本化路径 - 通用版本
  '/api/swagger.json',
  '/api/swagger.yaml',
  '/api/openapi.json',
  '/api/openapi.yaml',

  // 文档路径
  '/docs/api',
  '/docs/swagger.json',
  '/docs/openapi.json',

  // 常见替代路径
  '/swagger',
  '/api/spec',
  '/spec',
  '/doc',
  '/docs'
];

/**
 * 从完整 URL 提取基础 URL
 */
export function extractBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const basePath = pathParts.slice(0, 2).join('/');
    return `${urlObj.origin}${basePath ? '/' + basePath : ''}`;
  } catch {
    return url;
  }
}

/**
 * 验证响应是否包含有效的 Swagger/OpenAPI 文档
 */
export function isValidSwaggerDocument(data: any): boolean {
  return !!(data?.swagger || data?.openapi);
}

/**
 * 检测 Swagger URL（带自动回退）
 */
export async function detectSwaggerUrl(
  initialUrl: string,
  options: {
    maxAttempts?: number;
    timeout?: number;
    customHeaders?: Record<string, string>;
  } = {}
): Promise<{ success: boolean; url?: string; format?: 'json' | 'yaml'; attemptedPaths?: string[] }> {
  const { maxAttempts = 10, timeout = 5000, customHeaders = {} } = options;
  const attemptedPaths: string[] = [];

  // 步骤 1: 尝试原始 URL
  const originalResult = await tryUrl(initialUrl, timeout, customHeaders);
  attemptedPaths.push(initialUrl);

  if (originalResult.success) {
    return originalResult;
  }

  // 步骤 2: 尝试常见路径
  const baseUrl = extractBaseUrl(initialUrl);

  for (const path of COMMON_SWAGGER_PATHS.slice(0, maxAttempts - 1)) {
    const fullUrl = baseUrl + path;
    const result = await tryUrl(fullUrl, timeout, customHeaders);
    attemptedPaths.push(fullUrl);

    if (result.success) {
      logger.info(`Swagger 文档发现于: ${fullUrl}`);
      return result;
    }
  }

  // 步骤 3: 未找到有效文档
  return {
    success: false,
    attemptedPaths
  };
}

/**
 * 尝试单个 URL
 */
async function tryUrl(
  url: string,
  timeout: number,
  headers: Record<string, string>
): Promise<{ success: boolean; url?: string; format?: 'json' | 'yaml' }> {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Swagger-MCP-Detector/1.0.0', ...headers },
      timeout,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    if (response.status === 404 || !isValidSwaggerDocument(response.data)) {
      return { success: false };
    }

    const format = url.endsWith('.yaml') || url.endsWith('.yml') ||
                   response.headers['content-type']?.includes('yaml')
                   ? 'yaml' : 'json';

    return { success: true, url, format };
  } catch {
    return { success: false };
  }
}
