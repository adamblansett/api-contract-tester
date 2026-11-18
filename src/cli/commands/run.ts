import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { ExitCode } from '../../config/exitCodes.js';
import { emitGitHubAnnotations, formatGitHubSummary } from '../../reporters/github.js';
import { JsonReporter } from '../../reporters/json.js';
import { JUnitReporter } from '../../reporters/junit.js';
import { TerminalReporter } from '../../reporters/terminal.js';
import type { Reporter, ReportFormat } from '../../reporters/types.js';
import { SuiteRunner } from '../../runner/suiteRunner.js';
import type { RunnerOptions, SuiteRunSummary } from '../../runner/types.js';
import { validateSpecification } from '../../spec/validator.js';
import { loadEnvFile } from '../envLoader.js';

export interface CliRunOptions {
  baseUrl?: string;
  format?: ReportFormat;
  output?: string;
  concurrency?: string;
  timeout?: string;
  allowDestructive?: boolean;
  envFile?: string;
  verbose?: boolean;
  filter?: string;
  blockPrivateNetworks?: boolean;
  dryRun?: boolean;
  githubSummary?: boolean | string;
  watch?: boolean;
}

function getReporter(format?: ReportFormat): Reporter {
  switch (format) {
    case 'json':
      return new JsonReporter();
    case 'junit':
      return new JUnitReporter();
    case 'terminal':
    default:
      return new TerminalReporter();
  }
}

async function executeSuiteOnce(
  specPath: string,
  options: CliRunOptions,
): Promise<{ exitCode: number; summary?: SuiteRunSummary }> {
  const resolvedSpecPath = path.resolve(process.cwd(), specPath);

  if (!fs.existsSync(resolvedSpecPath)) {
    console.error(pc.red(`Error: Specification file not found: ${specPath}`));
    return { exitCode: ExitCode.SPEC_ERROR };
  }

  const MAX_SPEC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  try {
    const stat = fs.statSync(resolvedSpecPath);
    if (stat.size > MAX_SPEC_SIZE_BYTES) {
      console.error(
        pc.red(`Error: Specification file exceeds 10MB size limit (${stat.size} bytes)`),
      );
      return { exitCode: ExitCode.SPEC_ERROR };
    }
  } catch (statErr) {
    console.error(
      pc.red(
        `Error reading specification file: ${statErr instanceof Error ? statErr.message : String(statErr)}`,
      ),
    );
    return { exitCode: ExitCode.SPEC_ERROR };
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
      return { exitCode: ExitCode.CONFIG_OR_INTERNAL_ERROR };
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
    return { exitCode: ExitCode.SPEC_ERROR };
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
    return { exitCode: ExitCode.SPEC_ERROR };
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
    return { exitCode: ExitCode.SPEC_ERROR };
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
    return { exitCode: ExitCode.CONFIG_OR_INTERNAL_ERROR };
  }

  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : undefined;
  if (concurrency !== undefined && (isNaN(concurrency) || concurrency < 1)) {
    console.error(pc.red(`Error: Invalid concurrency value: ${options.concurrency}`));
    return { exitCode: ExitCode.CONFIG_OR_INTERNAL_ERROR };
  }

  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : undefined;
  if (timeoutMs !== undefined && (isNaN(timeoutMs) || timeoutMs < 1)) {
    console.error(pc.red(`Error: Invalid timeout value: ${options.timeout}`));
    return { exitCode: ExitCode.CONFIG_OR_INTERNAL_ERROR };
  }

  const runnerOptions: RunnerOptions = {
    baseUrl,
    concurrency,
    timeoutMs,
    allowDestructive: options.allowDestructive,
    env,
    filter: options.filter,
    blockPrivateNetworks: options.blockPrivateNetworks,
    dryRun: options.dryRun,
  };

  const runner = new SuiteRunner();
  let summary: SuiteRunSummary;
  try {
    summary = await runner.runSuite(spec, runnerOptions);
  } catch (runErr) {
    console.error(
      pc.red(
        `Internal Execution Error: ${runErr instanceof Error ? runErr.message : String(runErr)}`,
      ),
    );
    return { exitCode: ExitCode.CONFIG_OR_INTERNAL_ERROR };
  }

  // Handle dry-run output
  if (options.dryRun) {
    console.log('');
    console.log(pc.bold(pc.cyan('API Contract Tester — Dry Run / cURL Previews:')));
    console.log(pc.gray('─'.repeat(70)));
    for (const test of summary.results) {
      if (test.curlPreview) {
        console.log(`  ${pc.bold(test.id)}: ${pc.dim(test.name)}`);
        console.log(`  ${pc.green(test.curlPreview)}`);
        console.log('');
      }
    }
    console.log(pc.gray('─'.repeat(70)));
    return { exitCode: ExitCode.SUCCESS, summary };
  }

  // Format report
  const reporter = getReporter(options.format);
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

  // GitHub Actions integration
  if (process.env.GITHUB_ACTIONS === 'true') {
    emitGitHubAnnotations(summary);
  }

  const summaryPath =
    typeof options.githubSummary === 'string'
      ? options.githubSummary
      : options.githubSummary === true
        ? process.env.GITHUB_STEP_SUMMARY
        : process.env.GITHUB_STEP_SUMMARY;

  if (summaryPath) {
    try {
      const resolvedSummaryPath = path.resolve(process.cwd(), summaryPath);
      const markdown = formatGitHubSummary(summary);
      fs.appendFileSync(resolvedSummaryPath, markdown + '\n', 'utf-8');
    } catch (err) {
      console.error(
        pc.red(
          `Failed to write GitHub summary: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  return { exitCode: summary.exitCode, summary };
}

export async function runRunCommand(specPath: string, options: CliRunOptions): Promise<number> {
  const result = await executeSuiteOnce(specPath, options);

  if (!options.watch) {
    return result.exitCode;
  }

  // Watch mode implementation
  console.log(pc.cyan('\nWatching for file changes... (Press Ctrl+C to exit)'));
  const resolvedSpecPath = path.resolve(process.cwd(), specPath);
  const watchPaths = [resolvedSpecPath];

  if (options.envFile) {
    const resolvedEnv = path.resolve(process.cwd(), options.envFile);
    if (fs.existsSync(resolvedEnv)) {
      watchPaths.push(resolvedEnv);
    }
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  for (const p of watchPaths) {
    fs.watch(p, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.clear();
        console.log(
          pc.yellow(`\nFile change detected in ${path.basename(p)}. Re-running test suite...\n`),
        );
        await executeSuiteOnce(specPath, options);
      }, 150);
    });
  }

  // Keep process open in watch mode
  return new Promise(() => {});
}
