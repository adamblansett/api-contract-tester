# API Contract Tester

[![CI](https://github.com/adamblansett/api-contract-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/adamblansett/api-contract-tester/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18.0.0](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org)

**API Contract Tester** (`api-contract-tester`) is a production-minded, open-source TypeScript CLI and programmatic library that validates HTTP APIs against explicit contracts and detects integration regressions.

Built for CI/CD pipelines, local development workflows, and automated service verification, it emphasizes **deterministic execution**, **strict security guardrails**, **zero-leak secret redaction**, and **clear diagnostic reporting**.

---

## Key Features

- **Declarative Test Specifications**: Versioned JSON contracts defining HTTP requests, parameter substitutions, and comprehensive response expectations.
- **Chained Workflows & Variable Capture**: Extract values from response bodies or headers (`capture: { "AUTH_TOKEN": "body.token" }`) and inject them into downstream test paths, headers, or payloads. Dynamically captured secrets are automatically registered for redaction.
- **Strict Response Assertions**:
  - HTTP status codes (exact numbers, arrays, or status classes like `"2xx"`, `"4xx"`)
  - Required and prohibited response headers
  - Content-Type verification with media-type and parameter parsing
  - JSON Schema validation powered by **Ajv** (with `ajv-formats` support)
  - Safe nested property existence (`user.profile.id`, `items[0].sku`)
  - Exact and partial/containment value checks
  - Regular expression pattern matching (`matches: { "headers.etag": "^W/...", "body.email": "^[^@]+@[^@]+$" }`)
  - Numeric boundary comparisons (`numeric: { "body.total": { "gt": 0, "lte": 100 } }`)
  - Array length and constraint assertions (`array: { "body.items": { "minItems": 1, "isNotEmpty": true } }`)
  - Response time latency thresholds (`maxResponseTimeMs`)
- **Security by Default & Enterprise Shields**:
  - **Zero Pre-Execution I/O**: `validate` command and specification parsing perform 0 network requests.
  - **Origin & Path Guardrails**: Request paths must be relative; absolute URLs, protocol-relative prefixes (`//`, `/\`), backslashes, and null bytes are rejected. Base URL path prefixes (e.g. `/api/v1`) are strictly preserved, and traversal escaping (`../`) is blocked.
  - **Embedded Credentials Blocked**: Userinfo (`user:pass@host`) is rejected in base URLs and redirect `Location` headers.
  - **Private Network & SSRF Shield (`--block-private-networks`)**: Opt-in DNS resolution and IP verification that aborts requests targeting loopback (`127.0.0.0/8`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), or link-local cloud metadata (`169.254.169.254`).
  - **Destructive Method Guard**: Mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked unless explicitly opted-in with `--allow-destructive` or `config.allowDestructive: true`.
  - **Zero-Leak Secret Redaction**: Common authentication headers, sensitive query parameters (`token`, `secret`, `key`, `password`), URL-encoded variants, dynamic captured variables, and configured environment variables are deeply redacted across terminal logs, JSON reports, JUnit XML, assertion diagnostics, and error stack traces.
  - **Resource Bounds & Slowloris Defense**: Request timeouts encompass both connection negotiation and response body streaming. Streaming payload caps (default 5 MB) abort oversized responses immediately.
  - **Safe Redirects**: Cross-origin redirects are blocked by default; supports `manual`, `follow-same-origin`, and `error` policies with cycle/loop detection and intermediate socket stream cleanup.
  - **Request Retries**: Configurable automatic retries with backoff for resilient network execution on transient failures.
- **Reporting & CI/CD Integration**:
  - Human-friendly ANSI terminal reporting with detailed failure diagnostics.
  - Machine-readable JSON output (`schemaVersion: 1.0.0`) for machine processing.
  - **JUnit XML Output (`--format junit`)** for native test reporting tabs in GitHub Actions, GitLab CI, Jenkins, and Azure DevOps.
  - **GitHub Actions Step Summaries & Workflow Annotations (`--github-summary`)** for rich PR and workflow run summaries.
- **Ecosystem Tooling & Developer Ergonomics**:
  - **OpenAPI 3.x Importer (`import-openapi`)**: Auto-generate contract test specifications from OpenAPI 3.0/3.1 YAML or JSON files.
  - **Mock Server (`mock`)**: Serve simulated endpoints directly from contract specifications for offline client and frontend development.
  - **JSON Schema Exporter (`export-schema`)**: Export IDE-ready JSON Schema for instant auto-completion and validation in VS Code and JetBrains editors.
  - **Test Filtering (`-k, --filter <pattern>`)**: Run only tests matching a name or ID regex.
  - **Dry-Run / cURL Preview (`--dry-run` / `--curl`)**: Inspect generated `curl` commands without sending network requests.
  - **Watch Mode (`-w, --watch`)**: Live re-execution when specifications or environment files change.

---

## Installation

### Globally via npm

```bash
npm install -g api-contract-tester
```

### Locally within a project

```bash
npm install --save-dev api-contract-tester
```

### Direct invocation via npx

```bash
npx api-contract-tester run ./api-tests.json --base-url http://127.0.0.1:3000
```

---

## Quick Start

### 1. Create a Test Specification (`api-tests.json`)

```json
{
  "$schema": "https://raw.githubusercontent.com/adamblansett/api-contract-tester/main/schemas/v1/contract.json",
  "version": "1.0.0",
  "name": "Health and Catalog Service Tests",
  "config": {
    "baseUrl": "http://127.0.0.1:3000"
  },
  "tests": [
    {
      "id": "health-check",
      "name": "Service health probe",
      "request": {
        "method": "GET",
        "path": "/health"
      },
      "expect": {
        "status": "2xx",
        "contentType": "application/json",
        "exact": {
          "status": "ok"
        },
        "maxResponseTimeMs": 300
      }
    }
  ]
}
```

### 2. Validate Specification Offline

Check specification syntax and schemas without executing any HTTP calls:

```bash
api-contract-tester validate ./api-tests.json
```

### 3. Run the Contract Tests

```bash
api-contract-tester run ./api-tests.json --base-url http://127.0.0.1:3000
```

---

## CLI Reference

### `api-contract-tester run <spec-path>`

Executes test requests declared in the specification against the target base URL.

| Option                     | Flag | Description                                                                        | Default          |
| -------------------------- | ---- | ---------------------------------------------------------------------------------- | ---------------- |
| `--base-url <url>`         | `-b` | Target base URL for API requests (e.g., `http://127.0.0.1:3000`)                   | `config.baseUrl` |
| `--format <format>`        | `-f` | Report format: `terminal`, `json`, or `junit`                                      | `terminal`       |
| `--output <file>`          | `-o` | File path to write the formatted report                                            | stdout only      |
| `--concurrency <num>`      | `-c` | Number of concurrent requests (bounded worker pool; sequential if capture is used) | `1` (sequential) |
| `--timeout <ms>`           | `-t` | Global per-request timeout in milliseconds                                         | `30000`          |
| `-k, --filter <pattern>`   |      | Filter tests by ID or name regex/substring                                         | none (run all)   |
| `--allow-destructive`      |      | Enable destructive HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`)                 | `false`          |
| `--block-private-networks` |      | Enforce DNS checks blocking loopback, RFC1918, and cloud metadata IP addresses     | `false`          |
| `--dry-run` / `--curl`     |      | Output cURL commands for test requests without making network calls                | `false`          |
| `-w, --watch`              |      | Watch specification and env files, automatically re-running on changes             | `false`          |
| `--github-summary [file]`  |      | Write GitHub Flavored Markdown summary (defaults to `$GITHUB_STEP_SUMMARY`)        | none             |
| `--env-file <file>`        |      | Load environment variables from a file for secret interpolation                    | none             |
| `--verbose`                | `-v` | Display individual assertion breakdown for passed checks                           | `false`          |

### `api-contract-tester validate <spec-path>`

Validates the specification structure, checks for duplicate test IDs, validates JSON Schema syntax, and confirms safe relative paths. Performs **no network requests**.

### `api-contract-tester import-openapi <openapi-path>`

Scaffolds a contract test specification automatically from an OpenAPI 3.0 / 3.1 YAML or JSON document:

```bash
api-contract-tester import-openapi ./openapi.yaml -o ./api-contract.json --base-url http://127.0.0.1:3000
```

### `api-contract-tester mock <spec-path>`

Spins up a local HTTP server that responds to routes and schemas declared in your contract specification:

```bash
api-contract-tester mock ./api-tests.json --port 3000 --host 127.0.0.1
```

### `api-contract-tester export-schema`

Exports the official JSON Schema (Draft 07/2020-12) for IDE auto-completion and linting:

```bash
api-contract-tester export-schema -o ./schemas/v1/contract.json
```

---

## Specification Reference

```json
{
  "$schema": "https://raw.githubusercontent.com/adamblansett/api-contract-tester/main/schemas/v1/contract.json",
  "version": "1.0.0",
  "name": "Suite Name",
  "description": "Optional description",
  "config": {
    "baseUrl": "http://127.0.0.1:3000",
    "timeoutMs": 10000,
    "maxBodyBytes": 5242880,
    "allowDestructive": false,
    "blockPrivateNetworks": false,
    "redirect": "manual",
    "retry": {
      "maxAttempts": 3,
      "backoffMs": 100
    },
    "headers": {
      "Accept": "application/json"
    }
  },
  "tests": [
    {
      "id": "auth-login",
      "name": "Authenticate and capture token",
      "request": {
        "method": "POST",
        "path": "/api/v1/auth/login",
        "body": { "username": "admin", "password": "${ADMIN_PASSWORD}" }
      },
      "expect": {
        "status": "2xx",
        "capture": {
          "AUTH_TOKEN": "body.token",
          "USER_ID": "body.user.id"
        }
      }
    },
    {
      "id": "get-profile",
      "name": "Fetch profile with captured token",
      "request": {
        "method": "GET",
        "path": "/api/v1/users/${USER_ID}",
        "headers": {
          "Authorization": "Bearer ${AUTH_TOKEN}"
        }
      },
      "expect": {
        "status": 200,
        "contentType": "application/json",
        "headers": {
          "required": ["x-request-id", "etag"],
          "prohibited": ["x-deprecated"]
        },
        "matches": {
          "headers['etag']": "^W/\"[a-f0-9]+\"$",
          "body.email": "^[^@]+@[^@]+\\.[a-z]+$"
        },
        "numeric": {
          "body.id": { "gt": 0, "lte": 1000 }
        },
        "array": {
          "body.roles": { "minItems": 1, "isNotEmpty": true }
        },
        "schema": {
          "type": "object",
          "properties": {
            "id": { "type": "number" },
            "email": { "type": "string" }
          },
          "required": ["id", "email"]
        },
        "maxResponseTimeMs": 250
      }
    }
  ]
}
```

---

## Exit Codes

`api-contract-tester` returns deterministic exit codes suitable for CI/CD scripting:

| Exit Code | Name                       | Description                                                                                                |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `0`       | `SUCCESS`                  | All executed tests passed assertions without error.                                                        |
| `1`       | `ASSERTION_FAILURE`        | The target server responded, but one or more assertions failed (contract regression).                      |
| `2`       | `SPEC_ERROR`               | Specification file is missing, contains invalid JSON, failed schema checks, or has duplicate IDs.          |
| `3`       | `TRANSPORT_ERROR`          | Transport/network failure (connection refused, DNS resolution failed, socket reset, or request timed out). |
| `4`       | `CONFIG_OR_INTERNAL_ERROR` | Invalid CLI arguments, configuration errors, safety guard violations, or unhandled exceptions.             |

---

## Security Model & SSRF Considerations

`api-contract-tester` acts as an HTTP client executing requests declared in local configuration files. Because automated HTTP clients can be leveraged against unintended destinations, the engine implements defense-in-depth safeguards validated by adversarial testing:

1. **Relative Path Enforcement**: Test definitions must declare relative paths (e.g. `/api/v1/users`). Absolute URLs (e.g. `http://internal.network/`), protocol-relative paths (`//evil.com`, `/\`, `\/`), backslashes, and null bytes are rejected during both specification schema validation and request construction.
2. **Origin & Path Prefix Sandboxing**: Request paths are resolved strictly against the configured `baseUrl`. Base URL path prefixes (e.g. `http://127.0.0.1:3000/api/v1`) are strictly preserved. Traversal attempts that escape the configured base path (e.g. `../../admin`) or mutate origin/protocol abort immediately with a `SecurityUrlError`.
3. **Embedded Credential Prevention**: Base URLs and redirect `Location` targets containing embedded userinfo (`user:pass@host`) are blocked to prevent accidental credential leakage.
4. **Private Network / SSRF Shield (`--block-private-networks`)**: For untrusted test specifications or multi-tenant CI runners, this option resolves DNS and blocks all loopback, RFC1918 private, link-local, and cloud metadata addresses (`169.254.169.254`).
5. **Destructive Method Gate**: Methods that cause side effects (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked by default unless `--allow-destructive` is passed or `config.allowDestructive: true` is configured.
6. **Redirect Safeguards & Socket Management**: Does not silently follow cross-origin redirects. Redirects can be inspected manually (`manual`), restricted to same-origin (`follow-same-origin`), or rejected as errors (`error`). Active redirect loop detection terminates cyclic redirects immediately, and intermediate response streams are cleanly cancelled (`response.body.cancel()`) to prevent socket leaks.
7. **Full-Lifecycle Timeout & Slowloris Defense**: Request timeouts encompass both connection/header arrival and the entire response body streaming phase. Stalled or slow-dripping streams are reliably aborted via `AbortController`.
8. **Zero-Leak Secret Redaction**: Common authentication headers (`Authorization`, `Proxy-Authorization`, `Cookie`, `X-Api-Key`), sensitive query parameters (`token`, `secret`, `key`, `password`), environment variable interpolations, dynamically captured variables, and their URL-encoded variants are automatically masked. Redaction is applied deeply across terminal diagnostics, assertion failure messages (`expected`, `actual`), JSON/JUnit reports, and error stack traces.
9. **No Dynamic Execution**: Test files are parsed strictly as declarative JSON. No arbitrary JavaScript or dynamic modules are ever evaluated.

> [!WARNING]
> **SSRF Notice & Boundary Limitations**: Without `--block-private-networks` enabled, URL validation strictly confines requests to the user-supplied `baseUrl` and prevents test cases from breaking out of that origin, but permits targeting loopback or private networks because local testing is common. When running tests in multi-tenant environments against untrusted input, always enable `--block-private-networks`.

---

## Current Scope vs. Future Directions

| Feature                                  | Status          | Notes                                                               |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------- |
| Versioned JSON Test Specifications       | **Implemented** | Strict Zod validation and types                                     |
| Chained Multi-Step Workflows (`capture`) | **Implemented** | Downstream parameter injection & automatic dynamic secret redaction |
| Full HTTP Method Coverage                | **Implemented** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS                        |
| Response Assertions & Ajv Schemas        | **Implemented** | Status, headers, Content-Type, Ajv, paths, values, latency          |
| Advanced Assertions (Regex, Num, Array)  | **Implemented** | `matches`, `numeric`, `array`, and `2xx`-`5xx` status classes       |
| Secret Redaction & Origin Safeguards     | **Implemented** | Redaction registry, URL resolver, destructive guard                 |
| Private Network / SSRF Shield            | **Implemented** | DNS lookup verification blocking private & cloud metadata IPs       |
| Terminal, JSON & JUnit XML Reports       | **Implemented** | Human readable, machine readable, and CI/CD XML                     |
| GitHub Actions Step Summary & Warnings   | **Implemented** | Markdown step summaries and workflow command annotations            |
| OpenAPI 3.x / Swagger Importer           | **Implemented** | Scaffolds test specs from OpenAPI YAML or JSON documents            |
| Built-in Mock Server                     | **Implemented** | Serves mock endpoints directly from contract specifications         |
| IDE JSON Schema Support                  | **Implemented** | Official Draft-07 schema for VS Code & JetBrains auto-completion    |
| Test Filtering, Dry-Run & Watch Mode     | **Implemented** | `-k, --filter`, `--dry-run` / `--curl`, and `-w, --watch`           |
| Bounded Concurrency & Sequential Mode    | **Implemented** | Deterministic order preservation                                    |
| HTTP/2 or gRPC Protocol Support          | _Out of Scope_  | Transport is strictly HTTP/1.1 REST/JSON APIs via Node native fetch |

---

## Programmatic Usage

`api-contract-tester` is fully exported as a TypeScript/ESM library:

```typescript
import { SuiteRunner, validateSpecification } from 'api-contract-tester';

const spec = {
  version: '1.0.0',
  name: 'Programmatic Test',
  tests: [
    {
      id: 'probe',
      name: 'Health probe',
      request: { method: 'GET', path: '/health' },
      expect: { status: '2xx' },
    },
  ],
};

// 1. Validate
const validation = validateSpecification(spec);
if (!validation.valid) {
  console.error(validation.errors);
}

// 2. Run
const runner = new SuiteRunner();
const summary = await runner.runSuite(spec, { baseUrl: 'http://127.0.0.1:3000' });
console.log(`Passed: ${summary.passed}/${summary.total}`);
```

---

## Development & Quality Gates

The project enforces automated quality gates with zero tolerance for lint errors, formatting deviations, type issues, or test regressions:

```bash
# Run lint, typecheck, format verification, vitest test suites, and build
npm run verify

# Execute Vitest test runner (92 tests across 20 test suites)
npm run test

# Check formatting without writing
npm run format:check

# Format files with Prettier
npm run format

# Run TypeScript typechecker
npm run typecheck

# Build the distributable package and ensure CLI binary permissions
npm run build
```

---

## ⚖️ Legal Disclaimer & Limitation of Liability

### 1. "AS IS" and Express Warranty Disclaimer

This software, documentation, contract validation engines, and test runners are provided on an **"AS IS"** and **"AS AVAILABLE"** basis, **WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND**, either express, implied, statutory, or otherwise. To the maximum extent permitted by applicable law, the author, copyright holders, and contributors expressly disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, quiet enjoyment, and non-infringement.

### 2. Authorized Testing & Network Traffic Notice

- **Explicit Authorization Required:** `api-contract-tester` generates active HTTP/HTTPS network traffic and synthetic payloads. Users must possess explicit, documented authorization from the system owner before executing contract tests or load against any target endpoint, API gateway, or network host.
- **Compliance with Computer Fraud Statutes:** Unauthorized probing, scanning, or fuzzing of computer systems may violate local and international cybercrime statutes (such as the United States Computer Fraud and Abuse Act - CFAA 18 U.S.C. § 1030). The user assumes sole and exclusive responsibility for ensuring all testing activities are lawful and authorized.
- The author and contributors expressly disclaim all liability for unauthorized network scans, firewall bans, IP blacklisting, denial-of-service conditions, or billing surges triggered by running this tool against third-party endpoints.

### 3. Contract Conformance vs. Production Safety

- **Heuristic Scope:** Validation of an HTTP endpoint against an OpenAPI 3.x specification confirms schema structural compatibility at the moment of testing. It does **not** guarantee business logic correctness, absence of concurrency or race conditions, transaction integrity, database consistency, authorization soundness, or production resilience under high load.
- Passing all contract tests does not guarantee that an API is defect-free, secure, or safe for production release.

### 4. Limitation of Liability

To the maximum extent permitted by applicable law, **IN NO EVENT SHALL THE AUTHOR, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, PUNITIVE, OR CONSEQUENTIAL DAMAGES** (including, but not limited to, loss of use, data, revenue, profits, business, or goodwill; system downtime; API breaking changes; service level agreement (SLA) penalties; data corruption; or procurement of substitute goods or services), however caused and on any theory of liability, whether in contract, strict liability, tort (including negligence or otherwise), or statute, arising in any way out of the use, reproduction, modification, distribution, or reliance upon this software, even if advised of the possibility of such damages.

### 5. Third-Party Trademarks & Non-Affiliation

All product names, logos, brands, and registered trademarks mentioned within this project (including OpenAPI, Swagger, Postman, Node.js, and Vitest) are the property of their respective owners. Mention of these entities does not imply endorsement, sponsorship, or affiliation with the author.

---

## License

MIT © 2025-2026 [Adam Blansett](https://adamblansett.com)
