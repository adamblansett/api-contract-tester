import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { ExitCode } from '../../config/exitCodes.js';
import type { HttpMethod, TestCase, TestSpecification } from '../../spec/types.js';

interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: {
    type?: string;
    default?: unknown;
    example?: unknown;
  };
}

interface OpenApiMediaType {
  schema?: Record<string, unknown>;
  example?: unknown;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, OpenApiMediaType>;
  };
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

export interface ImportOpenApiOptions {
  output?: string;
  baseUrl?: string;
  name?: string;
}

export async function runImportOpenApiCommand(
  specPath: string,
  options: ImportOpenApiOptions = {},
): Promise<number> {
  const resolvedPath = path.resolve(process.cwd(), specPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    return ExitCode.SPEC_ERROR;
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  let doc: OpenApiDoc;

  try {
    doc = yaml.parse(rawContent) as OpenApiDoc;
  } catch (parseErr) {
    console.error(
      `Failed to parse OpenAPI document: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    );
    return ExitCode.SPEC_ERROR;
  }

  if (!doc || typeof doc !== 'object' || (!doc.openapi && !doc.swagger)) {
    console.error(
      'Invalid OpenAPI specification: missing "openapi" or "swagger" version declaration.',
    );
    return ExitCode.SPEC_ERROR;
  }

  const suiteName = options.name ?? doc.info?.title ?? 'Imported OpenAPI Contract Tests';
  const baseUrl = options.baseUrl ?? doc.servers?.[0]?.url ?? 'http://127.0.0.1:3000';

  const tests: TestCase[] = [];
  const supportedMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
  const usedIds = new Set<string>();

  if (doc.paths && typeof doc.paths === 'object') {
    for (const [rawPath, pathItem] of Object.entries(doc.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const [methodKey, operation] of Object.entries(pathItem)) {
        const lowerMethod = methodKey.toLowerCase();
        if (!supportedMethods.has(lowerMethod)) continue;

        const method = lowerMethod.toUpperCase() as HttpMethod;
        const op = operation as OpenApiOperation;

        // Generate a unique test ID
        let baseId = op.operationId
          ? op.operationId.replace(/[^a-zA-Z0-9_-]/g, '_')
          : `${lowerMethod}-${rawPath
              .replace(/[^a-zA-Z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '')}`;

        if (!baseId || baseId === lowerMethod) {
          baseId = `${lowerMethod}-test`;
        }

        let testId = baseId;
        let counter = 1;
        while (usedIds.has(testId)) {
          testId = `${baseId}-${counter++}`;
        }
        usedIds.add(testId);

        // Path conversion: replace {param} with placeholder or ${PARAM}
        const convertedPath = rawPath.replace(/\{([^}]+)\}/g, '${$1}');

        // Query parameters
        const queryParams: Record<string, string> = {};
        if (Array.isArray(op.parameters)) {
          for (const param of op.parameters) {
            if (param.in === 'query') {
              const defaultVal = param.schema?.example ?? param.schema?.default ?? 'value';
              queryParams[param.name] = String(defaultVal);
            }
          }
        }

        // Request Body
        let requestBody: unknown = undefined;
        if (op.requestBody?.content?.['application/json']) {
          const jsonMedia = op.requestBody.content['application/json'];
          requestBody = jsonMedia.example ?? {};
        }

        // Find primary expected status & schema
        let expectedStatus: number | undefined;
        let expectedSchema: Record<string, unknown> | undefined;

        if (op.responses) {
          const statusCodes = Object.keys(op.responses);
          const successCode =
            statusCodes.find((c) => c.startsWith('2')) ?? statusCodes.find((c) => c !== 'default');

          if (successCode && !isNaN(parseInt(successCode, 10))) {
            expectedStatus = parseInt(successCode, 10);
            const responseObj = op.responses[successCode];
            const schemaObj = responseObj?.content?.['application/json']?.schema;
            if (schemaObj && typeof schemaObj === 'object') {
              expectedSchema = schemaObj;
            }
          }
        }

        tests.push({
          id: testId,
          name: op.summary ?? `${method} ${rawPath}`,
          description: op.description,
          request: {
            method,
            path: convertedPath.startsWith('/') ? convertedPath : `/${convertedPath}`,
            query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
            body: requestBody,
          },
          expect: {
            status: expectedStatus ?? 200,
            schema: expectedSchema,
          },
        });
      }
    }
  }

  if (tests.length === 0) {
    console.error('No supported operations found in OpenAPI document.');
    return ExitCode.SPEC_ERROR;
  }

  const generatedSpec: TestSpecification = {
    version: '1.0.0',
    name: suiteName,
    description: doc.info?.description,
    config: {
      baseUrl,
      allowDestructive: true,
    },
    tests,
  };

  const jsonOutput = JSON.stringify(generatedSpec, null, 2);

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, jsonOutput, 'utf-8');
    console.log(
      `Successfully generated contract test suite with ${tests.length} tests -> ${outputPath}`,
    );
  } else {
    console.log(jsonOutput);
  }

  return ExitCode.SUCCESS;
}
