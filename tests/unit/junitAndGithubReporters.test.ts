import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../../src/config/exitCodes.js';
import { emitGitHubAnnotations, formatGitHubSummary } from '../../src/reporters/github.js';
import { JUnitReporter } from '../../src/reporters/junit.js';
import type { SuiteRunSummary } from '../../src/runner/types.js';

describe('JUnit and GitHub Reporters Unit Tests', () => {
  const sampleSummary: SuiteRunSummary = {
    specName: 'Sample API Test Suite',
    specVersion: '1.0.0',
    total: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
    errored: 0,
    durationMs: 150.5,
    exitCode: ExitCode.ASSERTION_FAILURE,
    results: [
      {
        id: 't1-pass',
        name: 'Health check passes',
        status: 'PASSED',
        durationMs: 40.2,
        request: { method: 'GET', url: 'http://127.0.0.1:3000/health', headers: {} },
        assertions: [{ name: 'Status', passed: true, message: 'Status 200 matches' }],
      },
      {
        id: 't2-fail',
        name: 'Profile validation fails',
        status: 'FAILED',
        durationMs: 65.1,
        request: { method: 'GET', url: 'http://127.0.0.1:3000/profile', headers: {} },
        assertions: [
          {
            name: 'Status',
            passed: false,
            message: 'Expected 200, received 500',
            expected: 200,
            actual: 500,
          },
        ],
      },
      {
        id: 't3-skip',
        name: 'Deferred test',
        status: 'SKIPPED',
        durationMs: 0,
        request: { method: 'POST', url: '/admin', headers: {} },
        assertions: [],
      },
    ],
  };

  describe('JUnitReporter', () => {
    it('generates valid JUnit XML report', () => {
      const reporter = new JUnitReporter();
      const xml = reporter.format(sampleSummary);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain(
        '<testsuites name="Sample API Test Suite" tests="3" failures="1" errors="0" skipped="1"',
      );
      expect(xml).toContain(
        '<testcase classname="Sample API Test Suite.t1-pass" name="Health check passes"',
      );
      expect(xml).toContain(
        '<testcase classname="Sample API Test Suite.t2-fail" name="Profile validation fails"',
      );
      expect(xml).toContain(
        '<failure message="Assertion Failure" type="AssertionError">Status: Expected 200, received 500</failure>',
      );
      expect(xml).toContain(
        '<testcase classname="Sample API Test Suite.t3-skip" name="Deferred test"',
      );
      expect(xml).toContain('<skipped />');
    });
  });

  describe('GitHub Actions Integration', () => {
    it('formats markdown step summary table', () => {
      const markdown = formatGitHubSummary(sampleSummary);

      expect(markdown).toContain('## API Contract Test Results: Sample API Test Suite');
      expect(markdown).toContain('| **Total Tests** | 3 |');
      expect(markdown).toContain('| **Passed** | 1 |');
      expect(markdown).toContain('| **Failed** | 1 |');
      expect(markdown).toContain('| **Skipped** | 1 |');
      expect(markdown).toContain('`t1-pass`');
      expect(markdown).toContain('`t2-fail`');
      expect(markdown).toContain('Failed: Status');
    });

    it('emits workflow command annotations for failing tests', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      emitGitHubAnnotations(sampleSummary);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '::error title=Contract Assertion Failure (t2-fail)::Profile validation fails - Status: Expected 200, received 500',
        ),
      );

      consoleSpy.mockRestore();
    });
  });
});
