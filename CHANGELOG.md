# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-11-18

### Security

- **SSRF & IP Evasion Hardening (`src/security/dns.ts`)**:
  - Expanded IPv4 blacklisting to include Carrier-Grade NAT (RFC 6598: `100.64.0.0/10`), current network (`0.0.0.0/8`), broadcast (`255.255.255.255`), documentation blocks (RFC 5737: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`), benchmarking (RFC 2544: `198.18.0.0/15`), multicast (RFC 5771: `224.0.0.0/4`), and reserved ranges (RFC 1112: `240.0.0.0/4`).
  - Added mathematical IPv6 word parser and normalizer (`parseIPv6Words`) defeating compressed zeros (`::`), hexadecimal and dotted IPv4-mapped representations (`::ffff:127.0.0.1`, `::ffff:7f00:1`), NAT64 well-known prefixes (RFC 6052: `64:ff9b::/96`), 6to4 relays (RFC 3056: `2002::/16`), unique local (`fc00::/7`), link-local (`fe80::/10`), discard prefixes (RFC 6666: `100::/64`), and multicast (`ff00::/8`).
  - Blocked WHATWG restricted protocol ports (e.g. SMTP 25/465/587, SSH 22, SMB 445, FTP 20/21) under `--block-private-networks` to prevent cross-protocol smuggling attacks.
- **CRLF & Header Injection Prevention (`src/security/guards.ts`, `src/spec/schema.ts`)**:
  - Implemented `assertValidHeaders` enforcing RFC 9110 field-name token grammar on header keys.
  - Strictly prohibited `\r`, `\n`, and null bytes (`\0`) across header names and values to prevent HTTP response splitting and request smuggling.
  - Enforced schema-level header validation and prohibited prototype pollution property names (`__proto__`, `constructor`, `prototype`).
- **Deep Prototype Pollution Protection**:
  - Hardened property path lookups (`pathUtils.ts`) against forbidden prototype identifiers in header and body lookups.
  - Isolated variable capture (`capture`) and session variables in `executor.ts` using prototype-free dictionaries (`Object.create(null)`).
  - Constrained captured variable names to valid identifier syntax (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) and prohibited prototype names.
- **Automated Secret & Token Redaction (`src/security/redaction.ts`)**:
  - Added automated regex-based redaction for JSON Web Tokens (`ey...` -> `[REDACTED_JWT]`), AWS Access Key IDs (`AKIA...` -> `[REDACTED_AWS_KEY]`), and PEM Private Key blocks (`[REDACTED_PRIVATE_KEY]`).
  - Expanded sensitive header and parameter matching (`x-csrf-token`, `jwt`, `private-key`, `x-amz-security-token`, `pin`, `cvv`, etc.).
  - Redacted non-string primitive values (numbers, booleans) for sensitive fields in `redactDeep`.
- **ReDoS Mitigation (`src/assertions/matches.ts`)**:
  - Capped evaluated string values at 64KB and regex pattern lengths at 1000 characters to safeguard the Node.js event loop against catastrophic regex backtracking.
- **Mock Server & Input Size Hardening**:
  - Added request body size limits (5MB) on the mock HTTP server to prevent memory exhaustion DoS.
  - Bound mock server to `127.0.0.1` by default and added security warning if exposed to `0.0.0.0`.
  - Added default security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`) to mock responses.
  - Enforced a 10MB file size ceiling on specification inputs in `run` and `validate` commands.
- Expanded test suite: 106 tests across 21 test files (100% passing).

## [0.2.0] - 2026-11-18

### Added

- **Chained Multi-Step Workflows (`capture`)**:
  - Declarative extraction of response fields or headers (`capture: { "VAR_NAME": "path" }`).
  - Downstream interpolation of captured values via `${VAR_NAME}` in request paths, headers, query parameters, and payloads.
  - Automatic registration of all dynamically captured secrets in `RedactionRegistry` to prevent leaks.
- **Advanced Declarative Assertions**:
  - Status classes: Accepted string status ranges (`"1xx"`, `"2xx"`, `"3xx"`, `"4xx"`, `"5xx"`) alongside exact codes and numeric arrays.
  - Regex pattern matching: `matches` block for header and body field regular expressions.
  - Numeric boundary checks: `numeric` block supporting `gt`, `gte`, `lt`, `lte`, and `eq`.
  - Array validation: `array` block supporting `length`, `minItems`, `maxItems`, and `isNotEmpty`.
- **Ecosystem & Tooling Commands**:
  - `import-openapi`: CLI command that parses OpenAPI 3.0 / 3.1 YAML and JSON files and scaffolds valid test specifications.
  - `mock`: Local HTTP mock server that simulates endpoints and schemas declared in contract specifications.
  - `export-schema`: CLI command and pre-built JSON Schema (`schemas/v1/contract.json`) for IDE auto-completion.
- **CI/CD Enterprise Reporting**:
  - `JUnitReporter` (`--format junit`): Compliant JUnit XML test report output.
  - GitHub Actions integration: Native Markdown step summaries (`--github-summary` / `$GITHUB_STEP_SUMMARY`) and workflow command annotations (`::error ...::`).
- **Security & Reliability Enhancements**:
  - Private network / SSRF shield (`--block-private-networks` / `config.blockPrivateNetworks`): DNS lookup verification blocking loopback, RFC1918 private, link-local, and cloud metadata (`169.254.169.254`) IP addresses.
  - Request retries (`retry` config): Configurable per-request retry attempts and backoff delay for resilient execution.
- **Developer Ergonomics**:
  - Test filtering: `-k, --filter <pattern>` to execute specific tests by name or ID.
  - Dry-run / cURL preview: `--dry-run` and `--curl` flags to generate executable cURL commands without sending network requests.
  - Watch mode: `-w, --watch` to monitor specifications and environment files for live test re-execution.
- Expanded test suite: 92 unit and integration tests across 20 test suites (100% passing).

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
