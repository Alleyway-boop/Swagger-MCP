# Swagger MCP - TODO List

## Current Tasks

- 🟨 Create a web UI for testing generated tool definitions
- 🟨 Add support for generating complete MCP servers from Swagger definitions
- 🟨 Implement proxy behavior in generated MCP servers to forward requests to the original REST API
- 🟨 Integrate Zod for runtime input validation in generated handlers
- 🟨 Generate a complete Node.js project scaffold (tsconfig.json, package.json, entry point, .env.example, etc.) for each generated server (or add instructions to a prompt / cursor file)
- 🟨 Implement auto-detection of base URL from OpenAPI spec if not explicitly provided
- 🟨 Support configuration of all authentication types via environment variables
- 🟨 Ensure all generated code is fully typed with TypeScript
- 🟨 Improve error handling in generated tool handlers
- 🟨 **[In Progress]** Implement SSE transport mode (requires HTTP server setup)
- 🟨 **[In Progress]** Implement HTTP (StreamableHTTP) transport mode
- 🟨 **[In Progress]** Implement actual file download/upload logic in generated handlers

## Completed Tasks

### 01/24/2026

- ✅ **Phase 1 (P0)**: Implement `getFormatSuffix` function with format suffix detection (AsPdf, AsCsv, AsExcel, AsHtml, AsXml, AsText)
- ✅ **Phase 1 (P0)**: Add string case utilities (camelCase, pascalCase, formatMethodName)
- ✅ **Phase 1 (P0)**: Update `generateToolName` to accept endpoint parameter and append format suffixes
- ✅ **Phase 2 (P1)**: Create `SecuritySchemeParser` with security scheme parsing functionality
- ✅ **Phase 2 (P1)**: Integrate authentication parameter generation in `generateInputSchema`
- ✅ **Phase 2 (P1)**: Add support for API key, Bearer token, and Basic authentication
- ✅ **Phase 3 (P1)**: Create `TransportFactory` for transport mode management
- ✅ **Phase 3 (P1)**: Update `index.ts` to use transport configuration from environment variables
- ✅ **Phase 3 (P1)**: Add transport configuration variables to `.env.example`
- ✅ **Phase 4 (P1)**: Add file endpoint detection utilities (isFileEndpoint, hasContentType, getFileResponseFormat)
- ✅ **Phase 4 (P1)**: Update `generateHandlerFunction` to handle file endpoints with appropriate response types
- ✅ Fix test runner hardcoded paths in `run-all-tests.ts`

### 03/09/2025

- ✅ Add MCP prompt for guiding AI assistants through adding new endpoints
- ✅ Add MCP prompts for guiding AI assistants through common workflows
- ✅ Fix model code test failure - "Model 'Project' not found in Swagger definition"
- ✅ Fix error handling test for invalid HTTP method - updated error message and used valid endpoint path
- ✅ Remove improved-generate-endpoint-tool-code.ts and update tests to use the real generator
- ✅ Fix endpoint path issues in projects-api-v3.oas2.yml for authentication and file operations tests:
- ✅ Fix OpenAPI version compatibility tests - updated to check for 'inputSchema' instead of 'parameters'
- ✅ Fix schema validation tests - updated endpoints to use ones that exist in the Swagger definition
- ✅ Fix schema validation failures - updated to check for 'inputSchema' instead of 'parameters'
- ✅ Create examples for different Swagger API types (OpenAPI 2.0, 3.0, etc.)
- ✅ Add unit tests for the improved generator
- ✅ Add validation for complex endpoint structures like Create Task
- ✅ Implement validation for generated tool definitions against MCP schema
- ✅ Fix the generateEndpointToolCode method to properly handle json.Unmarshaler interfaces in OpenAPI definitions

### 03/08/2025

- ✅ Implement improved MCP tool code generator with full schema information
- ✅ Add support for YAML Swagger files
- ✅ Improve parameter naming to avoid problematic characters
- ✅ Generate more semantic tool names
- ✅ Include comprehensive documentation in generated tool definitions
- ✅ Make generated code self-contained without external dependencies
- ✅ Update README.md with documentation for the improved generator
- ✅ Add AI-specific instructions in tool descriptions
