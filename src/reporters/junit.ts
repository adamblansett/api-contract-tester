import type { SuiteRunSummary, TestExecutionResult } from '../runner/types.js';
import type { Reporter, ReporterOptions } from './types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class JUnitReporter implements Reporter {
  public format(summary: SuiteRunSummary, _options?: ReporterOptions): string {
    const lines: string[] = [];
    const totalSeconds = (summary.durationMs / 1000).toFixed(3);

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites name="${escapeXml(summary.specName)}" tests="${summary.total}" failures="${summary.failed}" errors="${summary.errored}" skipped="${summary.skipped}" time="${totalSeconds}">`,
    );

    lines.push(
      `  <testsuite name="${escapeXml(summary.specName)}" tests="${summary.total}" failures="${summary.failed}" errors="${summary.errored}" skipped="${summary.skipped}" time="${totalSeconds}">`,
    );

    for (const test of summary.results) {
      lines.push(this.formatTestCase(test, summary.specName));
    }

    lines.push('  </testsuite>');
    lines.push('</testsuites>');

    return lines.join('\n');
  }

  private formatTestCase(test: TestExecutionResult, suiteName: string): string {
    const timeSec = (test.durationMs / 1000).toFixed(3);
    const className = `${escapeXml(suiteName)}.${escapeXml(test.id)}`;
    const testName = escapeXml(test.name);

    if (test.status === 'PASSED') {
      return `    <testcase classname="${className}" name="${testName}" time="${timeSec}" />`;
    }

    if (test.status === 'SKIPPED') {
      return `    <testcase classname="${className}" name="${testName}" time="${timeSec}">\n      <skipped />\n    </testcase>`;
    }

    if (test.status === 'FAILED') {
      const failureMessages = test.assertions
        .filter((a) => !a.passed)
        .map((a) => `${a.name}: ${a.message}`)
        .join('\n');

      return `    <testcase classname="${className}" name="${testName}" time="${timeSec}">\n      <failure message="Assertion Failure" type="AssertionError">${escapeXml(failureMessages)}</failure>\n    </testcase>`;
    }

    if (test.status === 'ERROR') {
      const errMsg = test.error?.message ?? 'Execution Error';
      return `    <testcase classname="${className}" name="${testName}" time="${timeSec}">\n      <error message="${escapeXml(errMsg)}" type="${test.error?.code ?? 'Error'}">${escapeXml(errMsg)}</error>\n    </testcase>`;
    }

    return `    <testcase classname="${className}" name="${testName}" time="${timeSec}" />`;
  }
}
