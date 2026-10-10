import { performance } from 'node:perf_hooks';
import { DEFAULTS } from '../config/defaults.js';
import { ExitCode } from '../config/exitCodes.js';
import type { TestSpecification } from '../spec/types.js';
import { TestExecutor } from './executor.js';
import type { RunnerOptions, SuiteRunSummary, TestExecutionResult } from './types.js';

export class SuiteRunner {
  private executor: TestExecutor;

  constructor(executor?: TestExecutor) {
    this.executor = executor ?? new TestExecutor();
  }

  public async runSuite(
    spec: TestSpecification,
    options: RunnerOptions = {},
  ): Promise<SuiteRunSummary> {
    const startTime = performance.now();
    const concurrency = Math.max(1, options.concurrency ?? DEFAULTS.CONCURRENCY);
    const results: TestExecutionResult[] = new Array(spec.tests.length);

    if (concurrency === 1) {
      // Sequential execution (default)
      for (let i = 0; i < spec.tests.length; i++) {
        const test = spec.tests[i];
        if (test) {
          results[i] = await this.executor.executeTest(test, spec, options);
        }
      }
    } else {
      // Bounded concurrency while preserving test order
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < spec.tests.length) {
          const currentIndex = nextIndex++;
          const test = spec.tests[currentIndex];
          if (test) {
            results[currentIndex] = await this.executor.executeTest(test, spec, options);
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, spec.tests.length) }, () =>
        worker(),
      );
      await Promise.all(workers);
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let errored = 0;
    let hasTransportError = false;

    for (const res of results) {
      if (!res) continue;
      switch (res.status) {
        case 'PASSED':
          passed++;
          break;
        case 'FAILED':
          failed++;
          break;
        case 'SKIPPED':
          skipped++;
          break;
        case 'ERROR':
          errored++;
          if (res.error?.isTransport) {
            hasTransportError = true;
          }
          break;
      }
    }

    // Determine exit code
    let exitCode = ExitCode.SUCCESS;
    if (errored > 0) {
      exitCode = hasTransportError ? ExitCode.TRANSPORT_ERROR : ExitCode.CONFIG_OR_INTERNAL_ERROR;
    } else if (failed > 0) {
      exitCode = ExitCode.ASSERTION_FAILURE;
    }

    return {
      specName: spec.name,
      specVersion: spec.version,
      total: spec.tests.length,
      passed,
      failed,
      skipped,
      errored,
      durationMs,
      exitCode,
      results,
    };
  }
}
