import type { SuiteRunSummary } from '../runner/types.js';
import type { Reporter } from './types.js';

export class JsonReporter implements Reporter {
  public format(summary: SuiteRunSummary): string {
    const report = {
      schemaVersion: '1.0.0',
      spec: {
        name: summary.specName,
        version: summary.specVersion,
      },
      summary: {
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        errored: summary.errored,
        durationMs: summary.durationMs,
        exitCode: summary.exitCode,
      },
      tests: summary.results,
    };

    return JSON.stringify(report, null, 2);
  }
}
