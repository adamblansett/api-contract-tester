import type { SuiteRunSummary } from '../runner/types.js';

export interface ReporterOptions {
  verbose?: boolean;
}

export interface Reporter {
  format(summary: SuiteRunSummary, options?: ReporterOptions): string;
}
