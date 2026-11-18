#!/usr/bin/env node

import { Command } from 'commander';
import { runExportSchemaCommand } from './commands/exportSchema.js';
import { runImportOpenApiCommand } from './commands/importOpenApi.js';
import { runMockServerCommand } from './commands/mock.js';
import { runRunCommand } from './commands/run.js';
import { runValidateCommand } from './commands/validate.js';
import { ExitCode } from '../config/exitCodes.js';

const program = new Command();

program
  .name('api-contract-tester')
  .description(
    'Production-minded TypeScript CLI that validates HTTP APIs against explicit contracts and detects integration regressions',
  )
  .version('0.2.0');

program
  .command('run')
  .description('Execute test specifications against a target base URL')
  .argument('<spec-path>', 'Path to JSON test specification file')
  .option('-b, --base-url <url>', 'Target base URL for API requests (e.g., http://127.0.0.1:3000)')
  .option(
    '-f, --format <format>',
    'Report output format ("terminal", "json", or "junit")',
    'terminal',
  )
  .option('-o, --output <file>', 'Save output report to a file')
  .option('-c, --concurrency <number>', 'Number of concurrent requests (default: 1)', '1')
  .option('-t, --timeout <ms>', 'Request timeout limit in milliseconds (default: 30000)')
  .option(
    '--allow-destructive',
    'Allow destructive HTTP methods (POST, PUT, PATCH, DELETE) which are blocked by default',
  )
  .option(
    '--env-file <file>',
    'Load environment variables from a file for secret and path interpolation',
  )
  .option(
    '-k, --filter <pattern>',
    'Execute only test cases matching a regular expression or substring',
  )
  .option(
    '--block-private-networks',
    'Block requests targeting loopback, private RFC1918, or cloud metadata IP addresses',
  )
  .option(
    '--dry-run',
    'Print generated cURL commands for test requests without sending network calls',
  )
  .option('--curl', 'Alias for --dry-run (print cURL commands without executing)')
  .option(
    '-w, --watch',
    'Watch specification and env files for changes and re-run tests automatically',
  )
  .option(
    '--github-summary [file]',
    'Output a GitHub Flavored Markdown summary (defaults to GITHUB_STEP_SUMMARY environment variable)',
  )
  .option(
    '-v, --verbose',
    'Show full diagnostic details and assertion breakdowns for passing tests',
  )
  .action(async (specPath: string, options) => {
    try {
      const dryRun = Boolean(options.dryRun || options.curl);
      const exitCode = await runRunCommand(specPath, { ...options, dryRun });
      process.exit(exitCode);
    } catch (err) {
      console.error('Fatal CLI Error:', err);
      process.exit(ExitCode.CONFIG_OR_INTERNAL_ERROR);
    }
  });

program
  .command('validate')
  .description(
    'Validate specification syntax, schema rules, and assertion declarations without executing requests',
  )
  .argument('<spec-path>', 'Path to JSON test specification file')
  .action(async (specPath: string) => {
    try {
      const exitCode = await runValidateCommand(specPath);
      process.exit(exitCode);
    } catch (err) {
      console.error('Fatal Validation Error:', err);
      process.exit(ExitCode.SPEC_ERROR);
    }
  });

program
  .command('import-openapi')
  .description('Generate an API Contract Tester test specification from an OpenAPI 3.x document')
  .argument('<openapi-path>', 'Path to OpenAPI 3.x YAML or JSON file')
  .option('-o, --output <file>', 'Output path for generated test specification JSON file')
  .option('-b, --base-url <url>', 'Override base URL in generated test specification')
  .option('--name <name>', 'Test suite name')
  .action(async (openapiPath: string, options) => {
    try {
      const exitCode = await runImportOpenApiCommand(openapiPath, options);
      process.exit(exitCode);
    } catch (err) {
      console.error('Fatal Import Error:', err);
      process.exit(ExitCode.SPEC_ERROR);
    }
  });

program
  .command('mock')
  .description(
    'Run a local mock server based on routes and expectations declared in a test specification',
  )
  .argument('<spec-path>', 'Path to JSON test specification file')
  .option(
    '-p, --port <number>',
    'Port for mock server to listen on (default: 3000)',
    (v) => parseInt(v, 10),
    3000,
  )
  .option('-h, --host <host>', 'Host for mock server to bind to (default: 127.0.0.1)', '127.0.0.1')
  .action(async (specPath: string, options) => {
    try {
      const exitCode = await runMockServerCommand(specPath, options);
      process.exit(exitCode);
    } catch (err) {
      console.error('Fatal Mock Server Error:', err);
      process.exit(ExitCode.CONFIG_OR_INTERNAL_ERROR);
    }
  });

program
  .command('export-schema')
  .description('Export the JSON Schema (Draft 07/2020-12) for API Contract Tester specifications')
  .option('-o, --output <file>', 'Output path for JSON Schema file (prints to stdout if omitted)')
  .action(async (options) => {
    try {
      const exitCode = await runExportSchemaCommand(options);
      process.exit(exitCode);
    } catch (err) {
      console.error('Fatal Schema Export Error:', err);
      process.exit(ExitCode.CONFIG_OR_INTERNAL_ERROR);
    }
  });

program.parse(process.argv);
