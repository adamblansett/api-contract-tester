import pc from 'picocolors';
import type { SuiteRunSummary, TestExecutionResult } from '../runner/types.js';
import type { Reporter, ReporterOptions } from './types.js';

export class TerminalReporter implements Reporter {
  public format(summary: SuiteRunSummary, options: ReporterOptions = {}): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(
      `${pc.bold(pc.cyan('API Contract Tester'))} — ${pc.bold(summary.specName)} (v${summary.specVersion})`,
    );
    lines.push(pc.gray('─'.repeat(70)));

    for (const test of summary.results) {
      lines.push(this.formatTestLine(test, options.verbose));
    }

    lines.push(pc.gray('─'.repeat(70)));
    lines.push(this.formatSummaryBlock(summary));
    lines.push('');

    return lines.join('\n');
  }

  private formatTestLine(test: TestExecutionResult, verbose = false): string {
    const out: string[] = [];
    const timing = pc.gray(`(${test.durationMs}ms)`);

    switch (test.status) {
      case 'PASSED':
        out.push(`  ${pc.green('✔ PASS')}  ${pc.bold(test.id)}: ${test.name} ${timing}`);
        if (verbose) {
          out.push(`         ${pc.dim(test.request.method)} ${pc.dim(test.request.url)}`);
          for (const a of test.assertions) {
            out.push(`           ${pc.green('•')} ${a.name}: ${a.message}`);
          }
        }
        break;

      case 'SKIPPED':
        out.push(`  ${pc.yellow('○ SKIP')}  ${pc.bold(test.id)}: ${test.name}`);
        break;

      case 'FAILED':
        out.push(`  ${pc.red('✖ FAIL')}  ${pc.bold(test.id)}: ${test.name} ${timing}`);
        out.push(`         ${pc.bold(test.request.method)} ${test.request.url}`);
        if (test.response) {
          out.push(`         Response Status: ${pc.yellow(String(test.response.status))}`);
        }
        for (const a of test.assertions) {
          if (!a.passed) {
            out.push(`           ${pc.red('✖')} ${pc.bold(a.name)}: ${a.message}`);
            if (a.expected !== undefined && a.actual !== undefined) {
              out.push(`             Expected: ${pc.cyan(JSON.stringify(a.expected))}`);
              out.push(`             Received: ${pc.magenta(JSON.stringify(a.actual))}`);
            }
          }
        }
        if (test.response?.bodyPreview) {
          out.push(`         Response Body: ${pc.dim(test.response.bodyPreview)}`);
        }
        break;

      case 'ERROR':
        out.push(`  ${pc.magenta('▲ ERR ')}  ${pc.bold(test.id)}: ${test.name} ${timing}`);
        out.push(`         ${pc.bold(test.request.method)} ${test.request.url}`);
        if (test.error) {
          out.push(
            `         ${pc.red(test.error.isTransport ? 'Transport Error:' : 'Error:')} ${test.error.message}`,
          );
        }
        break;
    }

    return out.join('\n');
  }

  private formatSummaryBlock(summary: SuiteRunSummary): string {
    const parts = [
      pc.bold('Tests:'),
      summary.passed > 0 ? pc.green(`${summary.passed} passed`) : null,
      summary.failed > 0 ? pc.red(`${summary.failed} failed`) : null,
      summary.skipped > 0 ? pc.yellow(`${summary.skipped} skipped`) : null,
      summary.errored > 0 ? pc.magenta(`${summary.errored} errored`) : null,
      `${summary.total} total`,
    ].filter(Boolean);

    const timing = pc.gray(`Time: ${summary.durationMs}ms`);
    const statusTag =
      summary.failed === 0 && summary.errored === 0
        ? pc.bold(pc.bgGreen(pc.black(' PASSED ')))
        : pc.bold(pc.bgRed(pc.white(' FAILED ')));

    return `  ${statusTag}  ${parts.join(', ')}  ${timing}`;
  }
}
