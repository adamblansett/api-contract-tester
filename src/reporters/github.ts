import type { SuiteRunSummary } from '../runner/types.js';

/**
 * Formats a GitHub Actions Markdown Step Summary.
 */
export function formatGitHubSummary(summary: SuiteRunSummary): string {
  const lines: string[] = [];

  const statusBadge =
    summary.failed === 0 && summary.errored === 0 ? '✅ **PASSED**' : '❌ **FAILED**';

  lines.push(`## API Contract Test Results: ${summary.specName}`);
  lines.push(
    `**Version:** \`${summary.specVersion}\` | **Duration:** \`${summary.durationMs}ms\` | **Status:** ${statusBadge}`,
  );
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| :--- | :---: |');
  lines.push(`| **Total Tests** | ${summary.total} |`);
  lines.push(`| **Passed** | ${summary.passed} |`);
  lines.push(`| **Failed** | ${summary.failed} |`);
  lines.push(`| **Skipped** | ${summary.skipped} |`);
  lines.push(`| **Errors** | ${summary.errored} |`);
  lines.push('');

  lines.push('### Test Breakdown');
  lines.push('');
  lines.push('| Status | ID | Name | Method | Duration | Details |');
  lines.push('| :---: | :--- | :--- | :---: | :---: | :--- |');

  for (const test of summary.results) {
    let icon = '⚪';
    let details = '-';

    switch (test.status) {
      case 'PASSED':
        icon = '✅';
        details = `${test.assertions.length} assertions passed`;
        break;
      case 'FAILED': {
        icon = '❌';
        const failedAssertions = test.assertions
          .filter((a) => !a.passed)
          .map((a) => a.name)
          .join(', ');
        details = `Failed: ${failedAssertions}`;
        break;
      }
      case 'SKIPPED':
        icon = '⏭️';
        details = 'Skipped';
        break;
      case 'ERROR':
        icon = '⚠️';
        details = test.error?.message ? `Error: ${test.error.message}` : 'Error';
        break;
    }

    lines.push(
      `| ${icon} | \`${test.id}\` | ${test.name} | \`${test.request.method}\` | ${test.durationMs}ms | ${details} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Emits GitHub Actions workflow command annotations to stdout for failing tests.
 */
export function emitGitHubAnnotations(summary: SuiteRunSummary): void {
  for (const test of summary.results) {
    if (test.status === 'FAILED') {
      const failures = test.assertions
        .filter((a) => !a.passed)
        .map((a) => `${a.name}: ${a.message}`)
        .join('; ');
      console.log(
        `::error title=Contract Assertion Failure (${test.id})::${test.name} - ${failures}`,
      );
    } else if (test.status === 'ERROR') {
      console.log(
        `::error title=Contract Test Execution Error (${test.id})::${test.name} - ${test.error?.message ?? 'Execution error'}`,
      );
    }
  }
}
