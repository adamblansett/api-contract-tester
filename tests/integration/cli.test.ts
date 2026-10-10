import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRunCommand } from '../../src/cli/commands/run.js';
import { runValidateCommand } from '../../src/cli/commands/validate.js';
import { ExitCode } from '../../src/config/exitCodes.js';
import { MockServer } from './mockServer.js';

describe('CLI Commands Integration', () => {
  const mockServer = new MockServer();
  let baseUrl = '';
  let tempDir = '';

  beforeAll(async () => {
    baseUrl = await mockServer.start();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-cli-test-'));
  });

  afterAll(async () => {
    await mockServer.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates compliant specification with exit code 0', async () => {
    const specPath = path.join(tempDir, 'valid-spec.json');
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        version: '1.0.0',
        name: 'Valid Spec',
        tests: [
          {
            id: 't1',
            name: 'Health',
            request: { method: 'GET', path: '/health' },
            expect: { status: 200 },
          },
        ],
      }),
    );

    const code = await runValidateCommand(specPath);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('rejects invalid specification with exit code SPEC_ERROR (2)', async () => {
    const specPath = path.join(tempDir, 'invalid-spec.json');
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        version: '1.0.0',
        name: 'Invalid Spec',
        tests: [
          {
            id: 'bad-t1',
            name: 'Absolute path forbidden',
            request: { method: 'GET', path: 'http://evil.com/hack' },
            expect: { status: 200 },
          },
        ],
      }),
    );

    const code = await runValidateCommand(specPath);
    expect(code).toBe(ExitCode.SPEC_ERROR);
  });

  it('executes run command and outputs report to file', async () => {
    const specPath = path.join(tempDir, 'run-spec.json');
    const outputPath = path.join(tempDir, 'report.json');

    fs.writeFileSync(
      specPath,
      JSON.stringify({
        version: '1.0.0',
        name: 'Run Spec',
        tests: [
          {
            id: 't-health',
            name: 'Check Health',
            request: { method: 'GET', path: '/health' },
            expect: { status: 200, exact: { status: 'ok' } },
          },
        ],
      }),
    );

    const code = await runRunCommand(specPath, {
      baseUrl,
      format: 'json',
      output: outputPath,
    });

    expect(code).toBe(ExitCode.SUCCESS);
    expect(fs.existsSync(outputPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(report.schemaVersion).toBe('1.0.0');
    expect(report.summary.passed).toBe(1);
  });

  it('returns ExitCode.ASSERTION_FAILURE on contract regression', async () => {
    const specPath = path.join(tempDir, 'regression-spec.json');

    fs.writeFileSync(
      specPath,
      JSON.stringify({
        version: '1.0.0',
        name: 'Regression Spec',
        tests: [
          {
            id: 't-regression',
            name: 'Regression Check',
            request: { method: 'GET', path: '/health' },
            expect: { status: 500 }, // Will fail against mock server 200
          },
        ],
      }),
    );

    const code = await runRunCommand(specPath, { baseUrl });
    expect(code).toBe(ExitCode.ASSERTION_FAILURE);
  });
});
