# API Contract Tester

[![CI](https://github.com/adamblansett/api-contract-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/adamblansett/api-contract-tester/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18.0.0](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org)

**API Contract Tester** (`api-contract-tester`) is a production-minded, open-source TypeScript CLI and programmatic library that validates HTTP APIs against explicit contracts and detects integration regressions.

Built for CI/CD pipelines, local development workflows, and automated service verification, it emphasizes **deterministic execution**, **strict security guardrails**, **zero-leak secret redaction**, and **clear diagnostic reporting**.

---

## Key Features

- **Declarative Test Specifications**: Versioned JSON contracts defining HTTP requests and comprehensive response expectations.
- **Strict Response Assertions**:
  - HTTP status codes (single value or accepted status list)
  - Required and prohibited response headers
  - Content-Type verification
  - JSON Schema validation powered by **Ajv** (with `ajv-formats` support)
  - Safe nested property existence (`user.profile.id`, `items[0].sku`)
  - Exact and partial/containment value checks
  - Response time latency thresholds (`maxResponseTimeMs`)
- **Security by Default**:
  - **Zero Pre-Execution I/O**: `validate` command and specification parsing perform 0 network requests.
  - **Origin & Path Guardrails**: Request paths must be relative; absolute URLs, protocol-relative prefixes (`//`, `/\`), backslashes, and null bytes are rejected. Base URL path prefixes (e.g. `/api/v1`) are strictly preserved, and traversal escaping (`../`) is blocked.
  - **Embedded Credentials Blocked**: Userinfo (`user:pass@host`) is rejected in base URLs and redirect `Location` headers.
  - **Destructive Method Guard**: Mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked unless explicitly opted-in with `--allow-destructive` or `config.allowDestructive: true`.
  - **Zero-Leak Secret Redaction**: Common authentication headers, sensitive query parameters (`token`, `secret`, `key`, `password`), URL-encoded variants, and configured environment variables are deeply redacted across terminal logs, JSON reports, assertion diagnostics, and error stack traces.
  - **Resource Bounds & Slowloris Defense**: Request timeouts encompass both connection negotiation and response body streaming. Streaming payload caps (default 5 MB) abort oversized responses immediately.
  - **Safe Redirects**: Cross-origin redirects are blocked by default; supports `manual`, `follow-same-origin`, and `error` policies with cycle/loop detection and intermediate socket stream cleanup.
- **Reporting & Determinism**:
  - Human-friendly ANSI terminal reporting with detailed failure diagnostics.
  - Versioned machine-readable JSON output (`schemaVersion: 1.0.0`) for CI systems.
  - Granular, stable exit codes distinguishing contract failures from network transport errors.
  - Sequential execution by default with optional bounded concurrency preserving test result ordering.

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
        "status": 200,
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

| Option                | Flag | Description                                                        | Default          |
| --------------------- | ---- | ------------------------------------------------------------------ | ---------------- |
| `--base-url <url>`    | `-b` | Target base URL for API requests (e.g., `http://127.0.0.1:3000`)   | `config.baseUrl` |
| `--format <format>`   | `-f` | Report format: `terminal` or `json`                                | `terminal`       |
| `--output <file>`     | `-o` | File path to write the formatted report                            | stdout only      |
| `--concurrency <num>` | `-c` | Number of concurrent requests (bounded worker pool)                | `1` (sequential) |
| `--timeout <ms>`      | `-t` | Global per-request timeout in milliseconds                         | `30000`          |
| `--allow-destructive` |      | Enable destructive HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) | `false`          |
| `--env-file <file>`   |      | Load environment variables from a file for secret interpolation    | none             |
| `--verbose`           | `-v` | Display individual assertion breakdown for passed checks           | `false`          |

### `api-contract-tester validate <spec-path>`

Validates the specification structure, checks for duplicate test IDs, validates JSON Schema syntax, and confirms safe relative paths. Performs **no network requests**.

---

## Specification Reference

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "name": "Suite Name",
  "description": "Optional description",
  "config": {
    "baseUrl": "http://127.0.0.1:3000",
    "timeoutMs": 10000,
    "maxBodyBytes": 5242880,
    "allowDestructive": false,
    "redirect": "manual",
    "headers": {
      "Accept": "application/json"
    }
  },
  "tests": [
    {
      "id": "unique-test-identifier",
      "name": "Human-readable test name",
      "skip": false,
      "request": {
        "method": "GET",
        "path": "/api/v1/resource",
        "query": { "limit": 10 },
        "headers": { "X-Tenant": "tenant-1" },
        "body": { "key": "value" },
        "timeoutMs": 5000,
        "redirect": "manual"
      },
      "expect": {
        "status": 200,
        "contentType": "application/json",
        "headers": {
          "required": ["x-request-id"],
          "prohibited": ["x-deprecated"]
        },
        "schema": {
          "type": "object",
          "properties": {
            "id": { "type": "number" },
            "name": { "type": "string" }
          },
          "required": ["id", "name"]
        },
        "hasProperties": ["id", "nested.field", "items[0].sku"],
        "exact": { "nested.field": "expected_value" },
        "contains": { "items": [{ "sku": "ABC" }] },
        "maxResponseTimeMs": 250
      }
    }
  ]
}
```

### Environment Variable Interpolation

Use `${VARIABLE_NAME}` or `${VARIABLE_NAME:-default_value}` inside paths, headers, query parameters, or request bodies:

```json
{
  "headers": {
    "Authorization": "Bearer ${API_KEY}",
    "X-Client-Id": "${CLIENT_ID:-dev_client}"
  }
}
```

Values substituted from environment variables are automatically registered with the redaction engine and masked in output reports.

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
4. **Destructive Method Gate**: Methods that cause side effects (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked by default unless `--allow-destructive` is passed or `config.allowDestructive: true` is configured.
5. **Redirect Safeguards & Socket Management**: Does not silently follow cross-origin redirects. Redirects can be inspected manually (`manual`), restricted to same-origin (`follow-same-origin`), or rejected as errors (`error`). Active redirect loop detection terminates cyclic redirects immediately, and intermediate response streams are cleanly cancelled (`response.body.cancel()`) to prevent socket leaks.
6. **Full-Lifecycle Timeout & Slowloris Defense**: Request timeouts encompass both connection/header arrival and the entire response body streaming phase. Stalled or slow-dripping streams are reliably aborted via `AbortController`.
7. **Zero-Leak Secret Redaction**: Common authentication headers (`Authorization`, `Proxy-Authorization`, `Cookie`, `X-Api-Key`), sensitive query parameters (`token`, `secret`, `key`, `password`), environment variable interpolations, and their URL-encoded variants are automatically masked. Redaction is applied deeply across terminal diagnostics, assertion failure messages (`expected`, `actual`), JSON reports, and error stack traces.
8. **No Dynamic Execution**: Test files are parsed strictly as declarative JSON. No arbitrary JavaScript or dynamic modules are ever evaluated.

> [!WARNING]
> **SSRF Notice & Boundary Limitations**: URL validation strictly confines requests to the user-supplied `baseUrl` and prevents test cases from breaking out of that origin. However, `api-contract-tester` does not block private IP ranges (e.g. `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`) or link-local cloud metadata addresses (e.g. `http://169.254.169.254`) by default, as legitimate contract testing frequently targets local development servers, Docker bridge networks, or private VPC staging clusters. Users must ensure test suites only target authorized endpoints and environments they own or are permitted to test.

---

## Current Scope vs. Future Directions

| Feature                               | Status           | Notes                                                               |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| Versioned JSON Test Specifications    | **Implemented**  | Strict Zod validation and types                                     |
| Full HTTP Method Coverage             | **Implemented**  | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS                        |
| Response Assertions & Ajv Schemas     | **Implemented**  | Status, headers, Content-Type, Ajv, paths, values, latency          |
| Secret Redaction & Origin Safeguards  | **Implemented**  | Redaction registry, URL resolver, destructive guard                 |
| Terminal & Versioned JSON Reports     | **Implemented**  | Human readable + machine readable                                   |
| Bounded Concurrency & Sequential Mode | **Implemented**  | Deterministic order preservation                                    |
| OpenAPI 3.x / Swagger Importer        | _Planned Future_ | Will generate specifications from OpenAPI schemas                   |
| HTTP/2 or gRPC Protocol Support       | _Out of Scope_   | Transport is strictly HTTP/1.1 REST/JSON APIs via Node native fetch |
| Interactive Terminal TUI / Dashboard  | _Out of Scope_   | Focus is deterministic CLI & headless CI workflows                  |

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
      expect: { status: 200 },
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

# Execute Vitest test runner (66 tests across 15 test suites)
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
