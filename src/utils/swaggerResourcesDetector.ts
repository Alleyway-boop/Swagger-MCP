/**
 * Spring Boot Swagger Resources 检测工具
 * 处理微服务架构的 /swagger-resources 端点
 * 支持 Spring Cloud Gateway + knife4j 架构
 */

import axios from 'axios';
import logger from './logger.js';

export interface SwaggerResource {
  name: string;
  url: string;
  swaggerVersion: string;
  location: string;
}

export interface ResourcesDetectionResult {
  isMicroservices: boolean;
  isKnife4j?: boolean;
  services?: SwaggerResource[];
  error?: string;
  details?: {
    url?: string;
    status?: number;
    message?: string;
  };
}

/**
 * 检测是否为 knife4j 增强 UI
 */
async function detectKnife4j(baseUrl: string, options: { timeout?: number; customHeaders?: Record<string, string> } = {}): Promise<boolean> {
  const { timeout = 3000, customHeaders = {} } = options;
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  try {
    // knife4j 特征检查：/doc.html 页面
    const docHtmlResponse = await axios.get(`${normalizedUrl}/doc.html`, {
      headers: {
        'User-Agent': 'Swagger-MCP-Knife4j/1.0.0',
        ...customHeaders
      },
      timeout,
      validateStatus: (status) => status < 500
    });

    if (docHtmlResponse.status === 200) {
      const content = typeof docHtmlResponse.data === 'string'
        ? docHtmlResponse.data
        : JSON.stringify(docHtmlResponse.data);

      // 检查 knife4j 特征标记
      if (content.includes('knife4j') || content.includes('Knife4j') ||
          content.includes('knife4j') || content.includes('doc.html')) {
        logger.info('检测到 knife4j 增强 UI');
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 检测是否为 Spring Boot 微服务架构
 * 支持:
 * - 标准 Spring Boot Swagger
 * - Spring Cloud Gateway
 * - knife4j 增强
 */
export async function detectSwaggerResources(
  baseUrl: string,
  options: {
    timeout?: number;
    customHeaders?: Record<string, string>;
    debug?: boolean;
  } = {}
): Promise<ResourcesDetectionResult> {
  const { timeout = 5000, customHeaders = {}, debug = false } = options;

  // 标准化基础 URL
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const resourcesUrl = `${normalizedUrl}/swagger-resources`;

  // 添加调试日志
  if (debug || logger.level === 'debug') {
    logger.info(`[swagger-resources] 检测开始`, {
      input: baseUrl,
      normalized: normalizedUrl,
      target: resourcesUrl
    });
  }

  try {
    const response = await axios.get(resourcesUrl, {
      headers: {
        'User-Agent': 'Swagger-MCP-Resources/1.0.0',
        'Accept': 'application/json',
        ...customHeaders
      },
      timeout,
      validateStatus: (status) => status < 500
    });

    // 调试日志：响应信息
    if (debug || logger.level === 'debug') {
      logger.info(`[swagger-resources] 响应收到`, {
        status: response.status,
        isArray: Array.isArray(response.data),
        dataLength: Array.isArray(response.data) ? response.data.length : 0
      });
    }

    // 检查是否返回服务列表
    if (response.status === 200 && Array.isArray(response.data)) {
      const services = response.data;

      // 验证是否为有效的 Swagger 资源格式
      const isValid = services.every((s: any) =>
        s.name && (s.url || s.location)
      );

      if (isValid && services.length > 0) {
        // 检测是否使用 knife4j
        const isKnife4j = await detectKnife4j(baseUrl, { timeout, customHeaders });

        logger.info(`检测到 ${services.length} 个微服务${isKnife4j ? ' (knife4j)' : ''}`);

        return {
          isMicroservices: true,
          isKnife4j,
          services: services.map((s: any) => ({
            name: s.name,
            url: s.url || `/${s.name}/v2/api-docs`,  // knife4j 默认路径
            swaggerVersion: s.swaggerVersion || '2.0',
            location: s.location
          }))
        };
      }
    }

    // 不是微服务架构或返回无效数据
    return { isMicroservices: false };

  } catch (error: any) {
    // 增强错误处理：返回详细错误信息用于调试
    const status = error.response?.status;
    const message = error.message;
    const axiosErrorCode = error.code;

    logger.error(`[swagger-resources] 检测失败`, {
      url: resourcesUrl,
      status,
      message,
      axiosError: axiosErrorCode
    });

    // 返回详细错误信息用于调试
    return {
      isMicroservices: false,
      error: `${status || 'ERR'}: ${message}`,
      details: {
        url: resourcesUrl,
        status,
        message
      }
    };
  }
}

/**
 * 生成服务概览文本
 */
export function formatServiceOverview(
  services: SwaggerResource[],
  baseUrl: string,
  isKnife4j: boolean = false
): string {
  const lines = [
    '📋 **微服务架构 detected**',
    '',
  ];

  if (isKnife4j) {
    lines.push('🔪 **knife4j 增强**');
    lines.push('');
  }

  lines.push(`发现 ${services.length} 个服务：`);
  lines.push('');

  services.forEach((service, index) => {
    const fullUrl = `${baseUrl}${service.url}`;
    lines.push(`${index + 1}. **${service.name}**`);
    lines.push(`   - 文档: \`${service.url || service.location}\``);
    lines.push(`   - 版本: ${service.swaggerVersion}`);
    if (isKnife4j) {
      lines.push(`   - knife4j UI: \`${baseUrl}/doc.html\``);
    }
    lines.push(`   - 获取命令: \`service="${service.name}"\``);
    lines.push('');
  });

  lines.push('**使用方式：**');
  lines.push('```');
  lines.push('// 查看服务列表（当前）');
  lines.push(`getSwaggerDefinition({ url: "${baseUrl}" })`);
  lines.push('');
  lines.push('// 获取特定服务的文档');
  lines.push('getSwaggerDefinition({');
  lines.push(`  url: "${baseUrl}",`);
  lines.push(`  service: "${services[0].name}"  // 指定服务名称`);
  lines.push('})');
  lines.push('```');

  return lines.join('\n');
}
