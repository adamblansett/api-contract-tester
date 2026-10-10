# Contributing to API Contract Tester

Thank you for your interest in contributing to **API Contract Tester**!

## Development Guidelines

1. **Deterministic Core**: All core evaluations and assertions must remain offline, reproducible, and independent of external third-party network activity. Use local mock servers (`node:http`) for tests.
2. **Security by Default**:
   - Never send network requests during specification parsing or validation.
   - Enforce relative-path bounds and prevent origin escapes.
   - Guard destructive methods (`POST`, `PUT`, `PATCH`, `DELETE`) with explicit permission.
   - Redact credentials, tokens, and configured secrets across all reporters and errors.
3. **Type Safety**: Maintain strict TypeScript typing. Do not introduce implicit `any` or disable compiler safety checks.
4. **Quality & Verification**: Before submitting changes, ensure all lint checks, type checks, tests, formatting, and builds pass:
   ```bash
   npm run verify
   ```
5. **Testing**: Write unit tests for new assertions, security guards, or schema constructs, and integration tests for HTTP behaviors and CLI commands.

## Workflow

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a feature branch.
4. Run tests in watch mode during development:
   ```bash
   npm run test:watch
   ```
5. Format and verify your code before opening a pull request:
   ```bash
   npm run format
   npm run verify
   ```

## Code of Conduct

Be welcoming, respectful, and collaborative.
