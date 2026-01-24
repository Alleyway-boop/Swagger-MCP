/**
 * Security Scheme Parser
 * Parses OpenAPI/Swagger security schemes and generates authentication parameters
 */

/**
 * Represents a security scheme from OpenAPI/Swagger definition
 */
export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: any;
  description?: string;
}

/**
 * Represents a security requirement (one or more schemes)
 */
export interface SecurityRequirement {
  [key: string]: string[];
}

/**
 * Parse security schemes from a Swagger/OpenAPI definition
 * @param swaggerDefinition The Swagger/OpenAPI definition object
 * @returns A record of security scheme names to their definitions
 */
export function parseSecuritySchemes(swaggerDefinition: any): Record<string, SecurityScheme> {
  const schemes: Record<string, SecurityScheme> = {};

  // OpenAPI 3.0.x
  if (swaggerDefinition.components?.securitySchemes) {
    Object.assign(schemes, swaggerDefinition.components.securitySchemes);
  }
  // Swagger 2.0
  else if (swaggerDefinition.securityDefinitions) {
    Object.assign(schemes, swaggerDefinition.securityDefinitions);
  }

  return schemes;
}

/**
 * Get the security requirements for a specific endpoint
 * @param endpoint The endpoint object
 * @returns Array of security requirements (empty array if none defined)
 */
export function getEndpointSecurityRequirements(endpoint: any): SecurityRequirement[] {
  if (endpoint.security) {
    return endpoint.security;
  }
  // Fall back to global security if not defined on endpoint
  return [];
}

/**
 * Get authentication parameters for an endpoint
 * @param endpoint The endpoint object
 * @param securitySchemes The parsed security schemes
 * @returns Array of authentication parameter definitions
 */
export function getAuthParameters(
  endpoint: any,
  securitySchemes: Record<string, SecurityScheme>
): any[] {
  const requirements = getEndpointSecurityRequirements(endpoint);
  const authParams: any[] = [];

  for (const requirement of requirements) {
    for (const [schemeName, scopes] of Object.entries(requirement)) {
      const scheme = securitySchemes[schemeName];
      if (!scheme) continue;

      if (scheme.type === 'apiKey') {
        authParams.push({
          name: scheme.name || 'apiKey',
          in: scheme.in || 'header',
          type: 'string',
          description: scheme.description || `API key authentication (${schemeName})`,
          required: true,
          _security: true,
          _scheme: schemeName
        });
      } else if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer') {
        authParams.push({
          name: 'authorization',
          in: 'header',
          type: 'string',
          description: scheme.description || `Bearer token authentication (${schemeName})`,
          required: true,
          _security: true,
          _scheme: schemeName
        });
      } else if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') {
        authParams.push({
          name: 'authorization',
          in: 'header',
          type: 'string',
          description: scheme.description || `Basic authentication (${schemeName})`,
          required: true,
          _security: true,
          _scheme: schemeName
        });
      }
      // Note: OAuth2 and openIdConnect are not directly translated to simple parameters
      // as they require token exchange flows
    }
  }

  return authParams;
}

/**
 * Check if an endpoint requires authentication
 * @param endpoint The endpoint object
 * @param securitySchemes The parsed security schemes
 * @returns True if authentication is required
 */
export function requiresAuthentication(
  endpoint: any,
  securitySchemes: Record<string, SecurityScheme>
): boolean {
  const authParams = getAuthParameters(endpoint, securitySchemes);
  return authParams.length > 0;
}

/**
 * Get the security scheme names for an endpoint
 * @param endpoint The endpoint object
 * @returns Array of security scheme names required by the endpoint
 */
export function getEndpointSecuritySchemeNames(endpoint: any): string[] {
  const requirements = getEndpointSecurityRequirements(endpoint);
  const schemeNames: string[] = [];

  for (const requirement of requirements) {
    schemeNames.push(...Object.keys(requirement));
  }

  return schemeNames;
}

export default {
  parseSecuritySchemes,
  getEndpointSecurityRequirements,
  getAuthParameters,
  requiresAuthentication,
  getEndpointSecuritySchemeNames
};
