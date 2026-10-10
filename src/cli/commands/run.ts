import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { ExitCode } from '../../config/exitCodes.js';
import { JsonReporter } from '../../reporters/json.js';
import { TerminalReporter } from '../../reporters/terminal.js';
import { SuiteRunner } from '../../runner/suiteRunner.js';
import type { RunnerOptions } from '../../runner/types.js';
import { validateSpecification } from '../../spec/validator.js';
import { loadEnvFile } from '../envLoader.js';

export interface CliRunOptions {
  baseUrl?: string;
  format?: 'terminal' | 'json';
  output?: string;
  concurrency?: string;
  timeout?: string;
  allowDestructive?: boolean;
  envFile?: string;
  verbose?: boolean;
}

export async function runRunCommand(specPath: string, options: CliRunOptions): Promise<number> {
  const resolvedSpecPath = path.resolve(process.cwd(), specPath);

  if (!fs.existsSync(resolvedSpecPath)) {
    console.error(pc.red(`Error: Specification file not found: ${specPath}`));
    return ExitCode.SPEC_ERROR;
  }

  // Load environment variables if specified
  const env: Record<string, string | undefined> = { ...process.env };
  if (options.envFile) {
    try {
      const resolvedEnvPath = path.resolve(process.cwd(), options.envFile);
      const loadedEnv = loadEnvFile(resolvedEnvPath);
      Object.assign(env, loadedEnv);
    } catch (envErr) {
      console.error(
        pc.red(
          `Error loading env file: ${envErr instanceof Error ? envErr.message : String(envErr)}`,
        ),
      );
      return ExitCode.CONFIG_OR_INTERNAL_ERROR;
    }
  }

  // Read and parse specification
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedSpecPath, 'utf-8');
  } catch (err) {
    console.error(
      pc.red(
        `Error reading specification file: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return ExitCode.SPEC_ERROR;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch (err) {
    console.error(
      pc.red(
        `Error parsing specification JSON: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return ExitCode.SPEC_ERROR;
  }

  // Strictly validate specification
  const validation = validateSpecification(json);
  if (!validation.valid || !validation.spec) {
    console.error(
      pc.red(`\n✖ Invalid specification file (${validation.errors.length} error(s)):\n`),
    );
    for (const error of validation.errors) {
      console.error(`  ${pc.red('•')} [${pc.cyan(error.path || 'root')}]: ${error.message}`);
    }
    console.error('');
    return ExitCode.SPEC_ERROR;
  }

  const spec = validation.spec;

  // Check base URL requirement
  const baseUrl = options.baseUrl ?? spec.config?.baseUrl;
  if (!baseUrl) {
    console.error(
      pc.red(
        'Error: Missing required base URL. Specify --base-url in the command or "config.baseUrl" in the specification file.',
      ),
    );
    return ExitCode.CONFIG_OR_INTERNAL_ERROR;
  }

  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : undefined;
  if (concurrency !== undefined && (isNaN(concurrency) || concurrency < 1)) {
    console.error(pc.red(`Error: Invalid concurrency value: ${options.concurrency}`));
    return ExitCode.CONFIG_OR_INTERNAL_ERROR;
  }

  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : undefined;
  if (timeoutMs !== undefined && (isNaN(timeoutMs) || timeoutMs < 1)) {
    console.error(pc.red(`Error: Invalid timeout value: ${options.timeout}`));
    return ExitCode.CONFIG_OR_INTERNAL_ERROR;
  }

  const runnerOptions: RunnerOptions = {
    baseUrl,
    concurrency,
    timeoutMs,
    allowDestructive: options.allowDestructive,
    env,
  };

  const runner = new SuiteRunner();
  let summary;
  try {
    summary = await runner.runSuite(spec, runnerOptions);
  } catch (runErr) {
    console.error(
      pc.red(
        `Internal Execution Error: ${runErr instanceof Error ? runErr.message : String(runErr)}`,
      ),
    );
    return ExitCode.CONFIG_OR_INTERNAL_ERROR;
  }

  // Format report
  const isJson = options.format === 'json';
  const reporter = isJson ? new JsonReporter() : new TerminalReporter();
  const outputContent = reporter.format(summary, { verbose: options.verbose });

  // Output to file if requested
  if (options.output) {
    try {
      const outputPath = path.resolve(process.cwd(), options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, outputContent, 'utf-8');
    } catch (writeErr) {
      console.error(
        pc.red(
          `Error writing report to ${options.output}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        ),
      );
    }
  }

  // Output to stdout
  console.log(outputContent);

  return summary.exitCode;
}
