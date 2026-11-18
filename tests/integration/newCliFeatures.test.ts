import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runExportSchemaCommand } from '../../src/cli/commands/exportSchema.js';
import { runImportOpenApiCommand } from '../../src/cli/commands/importOpenApi.js';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';
import { validateSpecification } from '../../src/spec/validator.js';

describe('New CLI Features Integration Tests', () => {
  let tempDir: string;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-new-cli-test-'));

    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', path: req.url }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Test Filtering (--filter)', () => {
    it('executes only tests matching the filter pattern and skips the rest', async () => {
      const spec: TestSpecification = {
        version: '1.0.0',
        name: 'Filter Test Suite',
        config: { baseUrl },
        tests: [
          {
            id: 'auth-login',
            name: 'User Login',
            request: { method: 'GET', path: '/login' },
            expect: { status: 200 },
          },
          {
            id: 'user-profile',
            name: 'User Profile',
            request: { method: 'GET', path: '/profile' },
            expect: { status: 200 },
          },
          {
            id: 'billing-invoice',
            name: 'Billing Invoice',
            request: { method: 'GET', path: '/invoice' },
            expect: { status: 200 },
          },
        ],
      };

      const runner = new SuiteRunner();
      const summary = await runner.runSuite(spec, { filter: 'user' });

      expect(summary.total).toBe(3);
      expect(summary.passed).toBe(2); // auth-login (User Login has 'user' in name) and user-profile
      expect(summary.skipped).toBe(1); // billing-invoice
    });
  });

  describe('Dry-Run / cURL Preview (--dry-run)', () => {
    it('generates curl command string without initiating HTTP requests', async () => {
      const spec: TestSpecification = {
        version: '1.0.0',
        name: 'Dry Run Suite',
        config: { baseUrl, allowDestructive: true },
        tests: [
          {
            id: 't-dry',
            name: 'Dry Run Test',
            request: {
              method: 'POST',
              path: '/dry-run-endpoint',
              headers: { 'X-Custom-Header': 'dry-run-val' },
              body: { action: 'preview' },
            },
            expect: { status: 200 },
          },
        ],
      };

      const runner = new SuiteRunner();
      const summary = await runner.runSuite(spec, { dryRun: true });

      expect(summary.total).toBe(1);
      expect(summary.passed).toBe(1);
      const res = summary.results[0];
      expect(res?.curlPreview).toBeDefined();
      expect(res?.curlPreview).toContain('curl -s -S -X POST');
      expect(res?.curlPreview).toContain('dry-run-endpoint');
      expect(res?.curlPreview).toContain('X-Custom-Header');
    });
  });

  describe('OpenAPI 3.x Importer', () => {
    it('imports OpenAPI YAML file and creates valid test specification', async () => {
      const sampleYaml = `
openapi: 3.0.3
info:
  title: PetStore Sample API
  version: 1.0.0
  description: Sample API for testing OpenAPI import
servers:
  - url: http://127.0.0.1:4000
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            example: 10
      responses:
        '200':
          description: A paged array of pets
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: integer
                    name:
                      type: string
  /pets/{petId}:
    get:
      summary: Info for a specific pet
      operationId: showPetById
      responses:
        '200':
          description: Expected response to a valid request
          content:
            application/json:
              schema:
                type: object
                required:
                  - id
                  - name
`;
      const yamlPath = path.join(tempDir, 'petstore.yaml');
      const outputPath = path.join(tempDir, 'petstore-spec.json');
      fs.writeFileSync(yamlPath, sampleYaml, 'utf-8');

      const exitCode = await runImportOpenApiCommand(yamlPath, {
        output: outputPath,
      });

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      const generated = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const validation = validateSpecification(generated);
      expect(validation.valid).toBe(true);
      expect(generated.name).toBe('PetStore Sample API');
      expect(generated.tests.length).toBe(2);
      expect(generated.tests[0].request.method).toBe('GET');
      expect(generated.tests[0].request.path).toBe('/pets');
    });
  });

  describe('JSON Schema Exporter', () => {
    it('exports valid JSON Schema file', async () => {
      const schemaOutputPath = path.join(tempDir, 'contract.schema.json');
      const exitCode = await runExportSchemaCommand({ output: schemaOutputPath });

      expect(exitCode).toBe(0);
      expect(fs.existsSync(schemaOutputPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(schemaOutputPath, 'utf-8'));
      expect(content).toBeDefined();
      expect(typeof content).toBe('object');
      expect(content.$schema).toBeDefined();
    });
  });
});
