export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}
