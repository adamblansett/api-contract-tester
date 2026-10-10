# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-10

### Added

- Initial release of the **API Contract Tester** TypeScript CLI (`api-contract-tester`).
- Modular core architecture:
  - `src/cli/`: Command-line interface with `run` and `validate` commands.
  - `src/spec/`: Strict Zod specification schema, type definitions, offline validator, and environment variable substitution.
  - `src/security/`: Origin guardrails, safe URL resolution, secret redaction registry, destructive method protection, and payload size bounds.
  - `src/http/`: Safe HTTP execution via native `fetch`, timeout management (`AbortController`), bounded body streaming, and strict redirect policy handling.
  - `src/assertions/`: Extensible contract assertion registry covering status codes, headers, Content-Type, Ajv JSON Schema validation, required property paths, exact/partial JSON matching, and response-time thresholds.
  - `src/runner/`: Orchestrator supporting sequential and bounded concurrency execution with deterministic ordering, comprehensive summaries, and granular exit codes.
  - `src/reporters/`: Colorized terminal reporter with diagnostic breakdowns and versioned JSON reporter (`schemaVersion: 1.0.0`).
- Security features:
  - Absolute URL rejection in test requests to prevent accidental cross-origin SSRF.
  - Base URL path prefix preservation with traversal protection blocking attempts to escape the base origin or path prefix.
  - Embedded credentials (`user:pass@host`) rejection in base URLs and redirect `Location` headers.
  - Destructive method gate requiring `--allow-destructive` or explicit config for `POST`, `PUT`, `PATCH`, and `DELETE`.
  - Comprehensive secret redaction for auth headers, sensitive query parameters, dynamic environment variables, and URL-encoded variants across terminal output, JSON reports, assertion diagnostics, and error stack traces.
  - Full-lifecycle request timeouts spanning both connection negotiation and response body streaming (Slowloris defense).
  - Redirect cycle/loop detection and intermediate response stream cancellation preventing socket leaks.
  - Zero network requests during specification parsing or validation (`validate` command).
- Granular exit codes:
  - `0`: All assertions passed.
  - `1`: Contract assertion failure.
  - `2`: Specification validation error.
  - `3`: Transport/network error.
  - `4`: Configuration or safety guard error.
- Full offline test suite with 66 unit and local mock server integration tests across 15 test suites.
- Example test specifications and documentation.
