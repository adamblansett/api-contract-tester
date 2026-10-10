#!/usr/bin/env node

import { Command } from 'commander';
import { runRunCommand } from './commands/run.js';
import { runValidateCommand } from './commands/validate.js';
import { ExitCode } from '../config/exitCodes.js';

const program = new Command();

program
  .name('api-contract-tester')
  .description(
    'Production-minded TypeScript CLI that validates HTTP APIs against explicit contracts and detects integration regressions',
  )
  .version('0.1.0');

program
  .command('run')
  .description('Execute test specifications against a target base URL')
  .argument('<spec-path>', 'Path to JSON test specification file')
  .option('-b, --base-url <url>', 'Target base URL for API requests (e.g., http://127.0.0.1:3000)')
  .option('-f, --format <format>', 'Report output format ("terminal" or "json")', 'terminal')
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
    '-v, --verbose',
    'Show full diagnostic details and assertion breakdowns for passing tests',
  )
  .action(async (specPath: string, options) => {
    try {
      const exitCode = await runRunCommand(specPath, options);
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

program.parse(process.argv);
