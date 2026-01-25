/**
 * getSwaggerDefinition Adapter
 *
 * Adapter that bridges the original file-based getSwaggerDefinition tool
 * to the new session-based infrastructure with ETag/Last-Modified support.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { handleDynamicSwaggerConfig } from '../dynamicSwaggerConfig.js';
import { SwaggerSearchTool } from '../../search/SwaggerSearchTool.js';
import { getSessionConfigManager } from '../../config/SessionConfigManager.js';
import logger from '../../utils/logger.js';
import { detectSwaggerUrl } from '../../utils/swaggerUrlDetector.js';
import { detectSwaggerResources, formatServiceOverview } from '../../utils/swaggerResourcesDetector.js';

/**
 * 规范化 URL 以避免细微差异导致重复文件
 * - 移除尾部斜杠
 * - 移除锚点
 * - 标准化查询参数（排序）
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // 移除锚点
    urlObj.hash = '';

    // 移除尾部斜杠
    let pathname = urlObj.pathname;
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    // 标准化查询参数（排序）
    if (urlObj.search) {
      const params = new URLSearchParams(urlObj.search);
      const sortedParams = Array.from(params.entries()).sort();
      urlObj.search = new URLSearchParams(sortedParams).toString();
    }

    return urlObj.toString();
  } catch {
    // URL 解析失败，返回原始 URL
    return url;
  }
}

// Global search tool instance
let searchTool: SwaggerSearchTool | null = null;

function getSearchTool(): SwaggerSearchTool {
  if (!searchTool) {
    searchTool = new SwaggerSearchTool();
  }
  return searchTool;
}

/**
 * Generate session ID from URL hash
 */
function generateSessionIdFromUrl(url: string): string {
  const urlHash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `session_${urlHash}`;
}

/**
 * Save swagger document to local file
 * Supports both JSON and YAML formats
 */
async function saveSwaggerDocument(url: string, saveLocation: string, customHeaders?: Record<string, string>): Promise<{
  filePath: string;
  data: any;
}> {
  const axios = (await import('axios')).default;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Swagger-MCP-Adapter/1.0.0',
      ...customHeaders
    },
    timeout: 30000
  });

  let data = response.data;

  // Detect and parse YAML format
  const contentType = response.headers['content-type'] || '';
  const isYaml = contentType.includes('yaml') ||
    contentType.includes('yml') ||
    url.endsWith('.yaml') ||
    url.endsWith('.yml') ||
    (typeof data === 'string' && !data.trim().startsWith('{'));

  if (isYaml) {
    try {
      data = yaml.load(data);
    } catch (error: any) {
      throw new Error(`YAML 解析失败: ${error.message}`);
    }
  }

  // Validate Swagger/OpenAPI format
  if (!data.openapi && !data.swagger) {
    throw new Error('无效的 Swagger/OpenAPI 文档');
  }

  // Use dedicated .swagger-cache subdirectory
  const cacheDir = path.join(saveLocation, '.swagger-cache');

  // Generate filename from normalized URL hash to avoid duplicate files
  const normalizedUrl = normalizeUrl(url);
  const filename = crypto.createHash('sha256').update(normalizedUrl).digest('hex') + '.json';
  const filePath = path.join(cacheDir, filename);

  // Ensure cache directory exists
  await fs.mkdir(cacheDir, { recursive: true });

  // Save to file (always as JSON for consistency)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  return { filePath, data };
}

/**
 * Create .claude/swagger-mcp.json config file (new format)
 */
async function createSwaggerMcpConfig(
  location: string,
  sessionId: string,
  url: string,
  cacheTTL?: number
): Promise<void> {
  const claudeDir = path.join(location, '.claude');
  const configPath = path.join(claudeDir, 'swagger-mcp.json');

  // Ensure .claude directory exists
  await fs.mkdir(claudeDir, { recursive: true });

  const config = {
    sessionId,
    swaggerUrl: url
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  logger.info(`Created .claude/swagger-mcp.json config at ${configPath}`);
}

/**
 * Adapter handler for getSwaggerDefinition
 * Enhanced with microservices detection, YAML support, and URL auto-detection
 */
export async function handleGetSwaggerDefinitionAdapter(input: {
  url: string;
  saveLocation: string;
  service?: string;              // 微服务名称（用于 swagger-resources 场景）
  autoDetect?: boolean;          // 启用自动检测（默认：true）
  autoSession?: boolean;
  sessionConfig?: {
    cache_ttl?: number;
    custom_headers?: Record<string, string>;
  };
}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    logger.info(`getSwaggerDefinition adapter called for ${input.url}`);

    const {
      url,
      saveLocation,
      service,
      autoDetect = true,
      autoSession = true,
      sessionConfig = {}
    } = input;

    // 步骤 1: 检测微服务架构（优先，当没有指定服务时）
    if (autoDetect && !service) {
      const resourcesResult = await detectSwaggerResources(url, {
        timeout: 5000,
        customHeaders: sessionConfig.custom_headers,
        debug: true  // 启用调试日志
      });

      // 检查是否有错误详情（用于用户反馈）
      if (!resourcesResult.isMicroservices && resourcesResult.error) {
        logger.warn(`微服务检测失败: ${resourcesResult.error}`, {
          details: resourcesResult.details
        });
      }

      if (resourcesResult.isMicroservices && resourcesResult.services) {
        // 返回服务概览（传递 isKnife4j）
        const overview = formatServiceOverview(
          resourcesResult.services,
          url,
          resourcesResult.isKnife4j
        );
        return {
          content: [{ type: 'text', text: overview }]
        };
      }
    }

    // 步骤 2: 如果指定了服务名称，构建服务文档 URL
    let targetUrl = url;
    if (service && autoDetect) {
      // 先获取服务列表
      const resourcesResult = await detectSwaggerResources(url, {
        timeout: 5000,
        customHeaders: sessionConfig.custom_headers
      });

      if (resourcesResult.isMicroservices && resourcesResult.services) {
        const targetService = resourcesResult.services.find(s => s.name === service);
        if (targetService) {
          targetUrl = `${url}${targetService.url}`;
          logger.info(`使用微服务文档: ${service} -> ${targetUrl}`);
        } else {
          // 服务名称不存在
          const availableServices = resourcesResult.services.map(s => s.name).join(', ');
          return {
            content: [{
              type: 'text',
              text: `❌ **服务未找到**

指定服务 "${service}" 不存在。

**可用服务：**
${availableServices}

**使用方式：**
\`\`\`
getSwaggerDefinition({
  url: "${url}",
  service: "选择一个服务名称"
})
\`\`\``
            }]
          };
        }
      }
    }

    // 步骤 3: 常规 URL 检测（如果不是微服务场景）
    if (autoDetect) {
      const detection = await detectSwaggerUrl(targetUrl, {
        maxAttempts: Number.MAX_VALUE,  // 测试所有 30+ 个常见路径
        timeout: 5000,
        customHeaders: sessionConfig.custom_headers
      });

      if (!detection.success && detection.attemptedPaths && detection.attemptedPaths.length > 1) {
        // 自动检测失败，返回错误信息
        const attempted = detection.attemptedPaths.slice(0, 5).join('\n  - ');
        return {
          content: [{
            type: 'text',
            text: `❌ **未找到 Swagger 文档**

尝试的路径：
  - ${attempted}
  ${detection.attemptedPaths.length > 5 ? '... 等更多' : ''}

**建议：**
1. 检查 API 是否需要认证（使用 custom_headers 参数）
2. 验证 API 基础 URL 是否正确
3. 查看 API 文档确认正确的 Swagger 路径

**使用示例（带认证）：**
\`\`\`
getSwaggerDefinition({
  url: "${url}",
  sessionConfig: {
    custom_headers: {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  }
})
\`\`\``
          }]
        };
      }

      if (detection.success && detection.url) {
        targetUrl = detection.url;
        logger.info(`URL 自动检测成功: ${targetUrl} (${detection.format})`);
      }
    }

    // 步骤 4: 继续正常流程，使用 targetUrl
    const sessionId = generateSessionIdFromUrl(targetUrl);

    // Configure session with improved tool
    if (autoSession) {
      await handleDynamicSwaggerConfig({
        session_id: sessionId,
        swagger_urls: [targetUrl],
        custom_headers: sessionConfig.custom_headers,
        cache_ttl: sessionConfig.cache_ttl || 600000 // 10 minutes default
      });

      logger.info(`Auto-configured session ${sessionId} for ${targetUrl}`);
    }

    // Save swagger document to local file (for backward compatibility)
    const { filePath } = await saveSwaggerDocument(
      targetUrl,
      saveLocation,
      sessionConfig.custom_headers
    );

    // Create .swagger-mcp config file
    await createSwaggerMcpConfig(
      saveLocation,
      sessionId,
      targetUrl,
      sessionConfig.cache_ttl || 600000
    );

    const responseText = `✅ **Swagger Definition 配置成功**

**文件位置:** \`${filePath}\`

**会话信息:**
- Session ID: \`${sessionId}\`
- API URL: ${targetUrl}
${service ? `- 微服务: ${service}` : ''}
- 自动刷新: 已启用
- 缓存 TTL: ${Math.round((sessionConfig.cache_ttl || 600000) / 1000)} 秒

**配置文件:**
已创建 \`.claude/swagger-mcp.json\` 配置文件。

**下一步:**
1. 使用 \`search_swagger_endpoints\` (session_id="${sessionId}") 搜索端点
2. 使用 \`get_endpoint_details\` 获取详细端点信息
3. 系统将自动检测并在 API 文档变更时刷新

**高级选项:**
- 检查会话状态: \`get_session_stats\` (session_id="${sessionId}")
- 清除缓存: \`clear_swagger_cache\` (session_id="${sessionId}")`;

    return {
      content: [{ type: 'text', text: responseText }]
    };

  } catch (error: any) {
    logger.error(`getSwaggerDefinition adapter error: ${error.message}`);

    let suggestions = '';

    // 根据错误类型提供具体建议
    if (error.message?.includes('401')) {
      suggestions = `
**建议:**
1. 提供认证头（使用 custom_headers 参数）
2. 示例: {"Authorization": "Bearer YOUR_TOKEN"}`;
    } else if (error.message?.includes('timeout')) {
      suggestions = `
**建议:**
1. API 服务器响应缓慢，请稍后重试
2. 检查网络连接`;
    } else if (error.message?.includes('YAML')) {
      suggestions = `
**建议:**
1. YAML 文档可能格式错误
2. 尝试使用该 API 的 JSON 版本（如果有）`;
    }

    return {
      content: [{
        type: 'text',
        text: `❌ **配置失败**

错误: ${error.message}
${suggestions}

**故障排除:**
- 验证 URL 可访问
- 检查网络连接
- 确认 saveLocation 目录存在`
      }]
    };
  }
}

/**
 * Export the adapter for use in tools/index.ts
 */
export const getSwaggerDefinitionAdapter = {
  handler: handleGetSwaggerDefinitionAdapter
};
