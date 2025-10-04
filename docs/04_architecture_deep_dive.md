# Architecture Deep Dive

This document provides a detailed exploration of the architectural patterns, design decisions, and data flows in the bun-osv-scanner project.

## Table of Contents

1. [Layered Architecture Overview](#layered-architecture-overview)
2. [Data Flow Through Layers](#data-flow-through-layers)
3. [Domain Model Deep Dive](#domain-model-deep-dive)
4. [Error Handling Strategy](#error-handling-strategy)
5. [Dependency Injection Pattern](#dependency-injection-pattern)
6. [Port/Adapter Pattern](#portadapter-pattern)
7. [SBOM Generation](#sbom-generation)
8. [Severity Classification Algorithm](#severity-classification-algorithm)
9. [Testability Design](#testability-design)

## Layered Architecture Overview

### Visual Representation

```
┌──────────────────────────────────────┐
│           boot/                      │  ← Composition Root
│  - scanner.ts (creates scanner)      │     (Wires everything together)
└─────────────┬────────────────────────┘
              │ depends on
              ▼
┌──────────────────────────────────────┐
│         adapters/                    │  ← Impure Layer
│  - osvScannerApi.ts, osvScannerCli.ts│     (Side effects: HTTP, process)
└─────────────┬────────────────────────┘
              │ depends on
              ▼
┌──────────────────────────────────────┐
│           app/                       │  ← Orchestration Layer
│  - securityService.ts                │     (Pure coordination logic)
│  - configureScanner.ts               │
└─────────────┬────────────────────────┘
              │ depends on
              ▼
┌──────────────────────────────────────┐
│     ports/          core/            │  ← Abstraction + Logic Layers
│  - osvScannerPort  - severity.ts     │     (Pure functions + interfaces)
│  - scannerConfigPort.ts - sbomGenerator.ts │
│                    - osvApiTranslator.ts   │
└─────────────┬────────────────────────┘
              │ depends on
              ▼
┌──────────────────────────────────────┐
│         foundation/                  │  ← Utility Layer
│  - bunLockParser.ts                  │     (Pure utilities, no deps)
│  - sbomJson.ts, cliArgs.ts           │
└──────────────────────────────────────┘
              │ depends on
              ▼
┌──────────────────────────────────────┐
│          types/                      │  ← Type Definitions
│  - result.ts, osv.ts, dependency.ts  │     (Domain types)
└──────────────────────────────────────┘
```

### Layer-by-Layer Breakdown

#### `types/` - Type Definitions

**Purpose:** Define domain types and algebraic data structures

**Files:**
- `result.ts` - Generic `Result<T, E>` type
- `osv.ts` - OSV vulnerability schema types
- `dependency.ts` - Package dependency types
- `sbom.ts` - CycloneDX SBOM types
- `bunSecurity.d.ts` - Bun API ambient declarations

**Key characteristics:**
- No runtime code, only types
- Shared across all layers
- Represents the domain vocabulary

#### `foundation/` - Pure Utilities

**Purpose:** Lowest-level pure functions with no dependencies

**Files:**
- `bunLockParser.ts` - Parse `bun.lock` JSON into dependency coordinates
- `sbomJson.ts` - Parse CycloneDX SBOM JSON into coordinates (REST adapter)
- `cliArgs.ts` - Parse CLI arguments into runtime configuration

**Key characteristics:**
- Zero dependencies on other layers
- Pure functions only (no I/O)
- Reusable across projects
- Example: String parsing, data transformation

**Example:**

```typescript
export const parseBunLock = (
  document: unknown
): Result<DependencyCoordinate[], ParseBunLockError> => {
  // Pure logic: JSON → structured data
  // No file reads, no network calls
};
```

#### `ports/` - Abstract Interfaces

**Purpose:** Define contracts for external dependencies (Dependency Inversion Principle)

**Files:**
- `osvScannerPort.ts` - Interface for OSV scanning capability
- `scannerConfigPort.ts` - Runtime configuration contract for adapter selection

**Key characteristics:**
- Only type definitions (interfaces)
- Depends only on `foundation/` types
- Enables testing with stubs/mocks
- Decouples core logic from implementation

**Example:**

```typescript
export type OsvScannerPort = {
  readonly scan: (
    sbomJson: string
  ) => Promise<Result<OsvScanResultsBody, OsvScannerError>>;
};
```

#### `core/` - Business Logic

**Purpose:** Pure domain logic and business rules

**Files:**
- `severity.ts` - Classify vulnerability severity
- `sbomGenerator.ts` - Generate CycloneDX SBOM from coordinates
- `osvApiTranslator.ts` - Translate REST responses into domain findings

**Key characteristics:**
- Pure functions (deterministic, no side effects)
- Depends only on `foundation/` and `types/`
- Contains critical business knowledge
- Highly testable (no I/O)

**Example:**

```typescript
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => {
  // Business rule: CVSS >= 7.0 → fatal
  // No external dependencies
};
```

#### `app/` - Application Services

**Purpose:** Orchestrate workflows by composing pure functions

**Files:**
- `securityService.ts` - Main security scanning service
- `configureScanner.ts` - Selects the appropriate adapter (REST vs CLI)

**Key characteristics:**
- Pure orchestration logic
- Coordinates multiple steps: parse → generate → scan → transform
- Depends on `core/`, `ports/`, `foundation/`
- Injects dependencies via function parameters

**Example:**

```typescript
export const createSecurityService = (deps: Dependencies) => ({
  async scan(lock) {
    const parsed = deps.parseLock(lock);        // foundation
    const sbom = deps.generateSbom(parsed);     // core
    const result = await deps.osvScanner(sbom); // port
    return buildAdvisories(result);             // local helper
  }
});
```

#### `adapters/` - Side Effects

**Purpose:** Implement ports with real I/O operations

**Files:**
- `osvScannerApi.ts` - Call OSV REST API via `fetch`
- `osvScannerCli.ts` - Execute osv-scanner CLI via `Bun.spawn`

**Key characteristics:**
- Contains ALL side effects (HTTP fetch, file I/O, process execution)
- Implements port interfaces
- Depends on `ports/`, `core/`, `foundation/` (never `app/`)
- Uses Bun APIs: `Bun.spawn()`, `writeFile()`, etc.

**Example:**

```typescript
export const createOsvScannerApiAdapter = (deps: {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
}) => ({
  async scan(sbomJson) {
    const coordinates = parseCycloneDxJson(sbomJson); // foundation
    const batch = await deps.fetch(`${deps.baseUrl}/v1/querybatch`, {...});
    const vulns = await hydrateDetails(batch, deps.fetch);
    return buildScanResultsBody("osv-rest-api", vulns);
  }
});

export const createOsvScannerCliAdapter = (): OsvScannerPort => ({
  async scan(sbomJson) {
    const tempFile = await createTempFile(sbomJson);   // I/O
    const process = Bun.spawn({ cmd: [...] });         // Side effect
    const output = await readOutput(process);          // I/O
    return parseJson(output);                          // Pure
  }
});
```

#### `boot/` - Composition Root

**Purpose:** Wire all layers together and export the final scanner

**Files:**
- `scanner.ts` - Create and export the Bun scanner instance

**Key characteristics:**
- Entry point for Bun runtime
- Dependency injection composition
- Can depend on all layers
- Minimal logic (mostly wiring)

**Example:**

```typescript
export const createScanner = (options = {}): Bun.Security.Scanner => {
  // Parse CLI args and configure adapters (REST by default)
  const config = options.runtimeConfig ?? parseScannerCliArgs(options.argv ?? []);
  const osvScanner =
    options.osvScanner ??
    configureScanner(config.ok ? config.data : createDefaultRuntimeConfig());
  
  // Create app service
  const securityService = createSecurityService({
    parseLock: parseBunLock,          // foundation
    generateSbom: generateCycloneDxSbom, // core
    osvScanner,                        // adapter
  });
  
  // Return Bun scanner API implementation
  return {
    version: "1",
    async scan({ packages }) { ... }
  };
};
```

## Data Flow Through Layers

### Happy Path: Scanning a Package

```
1. Bun calls scanner.scan({ packages: [...] })
   ↓
2. boot/scanner.ts: Read bun.lock
   File I/O: Bun.file("bun.lock").text()
   ↓
3. foundation/bunLockParser.ts: Parse lock
   Input: JSON object
   Output: Result<DependencyCoordinate[], Error>
   ↓
4. core/sbomGenerator.ts: Generate SBOM
   Input: DependencyCoordinate[]
   Output: SbomDocument (CycloneDX JSON)
   ↓
5. adapters/osvScannerApi.ts (default): Call OSV REST API
   - POST /v1/querybatch with dependency coordinates
   - Follow `next_page_token` for pagination
   - GET /v1/vulns/{id} to hydrate vulnerability details
   - Translate payloads into `OsvScanResultsBody`
   *CLI mode:* adapters/osvScannerCli.ts writes a temp file and spawns the `osv-scanner` binary
   Output: Result<OsvScanResultsBody, Error>
   ↓
6. core/severity.ts: Classify severities
   Input: OsvPackageFinding
   Output: AdvisoryLevel ("fatal" | "warn" | null)
   ↓
7. app/securityService.ts: Build advisories
   Input: OsvScanResultsBody + AdvisoryLevel classifier
   Output: Bun.Security.Advisory[]
   ↓
8. boot/scanner.ts: Return advisories
   Output: Bun.Security.Advisory[]
   ↓
9. Bun displays advisories and decides whether to proceed
```

### Error Path Examples

#### Lock Read Failure

```
1. Bun calls scanner.scan({ packages: [...] })
   ↓
2. boot/scanner.ts: Try to read bun.lock
   → File doesn't exist or unreadable
   ↓
3. Return fatal advisory
   {
     level: "fatal",
     package: "bun.lock",
     url: null,
     description: "Failed to read bun.lock: ENOENT"
   }
```

#### OSV Scanner Process Failure

```
1-4. [Same as happy path]
   ↓
5. adapters/osvScannerCli.ts: Spawn osv-scanner
   → Process exits with code 1
   → stderr: "osv-scanner: command not found"
   ↓
6. Return err({ type: "process-failed", message: "..." })
   ↓
7. app/securityService.ts: Propagate error
   ↓
8. boot/scanner.ts: Convert to fatal advisory
   {
     level: "fatal",
     package: "bun.lock",
     description: "OSV scanner failed: osv-scanner: command not found"
   }
```

#### OSV REST Request Failure

```
1-4. [Same as happy path]
   ↓
5. adapters/osvScannerApi.ts: POST /v1/querybatch / GET /v1/vulns/{id}
   → Network error, non-2xx status, or invalid JSON payload
   ↓
6. Return err({ type: "network-error" | "invalid-status" | "invalid-json", ... })
   ↓
7. app/securityService.ts: Propagate error
   ↓
8. boot/scanner.ts: Convert to fatal advisory
   {
     level: "fatal",
     package: "bun.lock",
     description: "OSV scanner failed: HTTP 500"
   }
```

## Domain Model Deep Dive

### Core Domain Types

#### DependencyCoordinate

**Purpose:** Uniquely identify a package version

```typescript
type DependencyCoordinate = {
  readonly name: DependencyName;      // e.g., "event-stream"
  readonly version: DependencyVersion; // e.g., "3.3.6"
  readonly ecosystem: DependencyEcosystem; // e.g., "npm"
  readonly purl?: DependencyPackageUrl; // e.g., "pkg:npm/event-stream@3.3.6"
};
```

**Usage:**
- Parsed from `bun.lock`
- Converted to SBOM components
- Matched against OSV results

#### OsvVulnerability

**Purpose:** Represent a single vulnerability from OSV database

```typescript
type OsvVulnerability = {
  readonly id: string;              // e.g., "GHSA-mh6f-8j2x-4483"
  readonly summary: string;          // Human-readable title
  readonly details?: string;         // Full description
  readonly severity: OsvSeverityScore[]; // CVSS scores
  readonly affected: OsvAffected[];  // Affected packages/versions
  readonly references?: OsvReference[]; // Links to advisories
  readonly database_specific?: {     // Metadata
    readonly severity?: OsvSeverityLabel; // "CRITICAL", "HIGH", etc.
  };
};
```

**Usage:**
- Returned by OSV (REST API or CLI)
- Parsed in adapters layer
- Classified by severity logic

#### OsvPackageFinding

**Purpose:** Group all vulnerabilities for a single package

```typescript
type OsvPackageFinding = {
  readonly package: DependencyCoordinate; // The vulnerable package
  readonly vulnerabilities: OsvVulnerability[]; // All CVEs/GHSAs
  readonly groups?: OsvVulnerabilityGroup[]; // Aggregated metadata
};
```

**Usage:**
- Unit of classification (one finding → one advisory)
- Contains all severity signals

#### Result<T, E>

**Purpose:** Type-safe error handling without exceptions

```typescript
type Result<T, E> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };
```

**Usage pattern:**

```typescript
const result = parseBunLock(document);
if (!result.ok) {
  // Handle error: result.error
  return err({ type: "lock-parse-error", error: result.error });
}
// Use success value: result.data
const coordinates = result.data;
```

**Benefits:**
- Explicit error handling (no forgotten try/catch)
- Type-safe (TypeScript knows which branch you're in)
- Composable (can chain Result-returning functions)

## Error Handling Strategy

### Three-Layer Error Model

```
1. Low-level errors (foundation/adapters)
   ↓
2. Service-level errors (app)
   ↓
3. User-facing advisories (boot)
```

#### Layer 1: Domain Errors

```typescript
// foundation/bunLockParser.ts
type ParseBunLockError =
  | "invalid-document"
  | "missing-packages";
```

#### Layer 2: Service Errors

```typescript
// app/securityService.ts
type SecurityServiceError =
  | { type: "lock-parse-error"; error: ParseBunLockError }
  | { type: "sbom-serialization-error"; message: string }
  | { type: "osv-scan-error"; error: OsvScannerError };
```

#### Layer 3: User Advisories

```typescript
// boot/scanner.ts
const buildFatalAdvisory = (message: string): Bun.Security.Advisory => ({
  level: "fatal",
  package: "bun.lock",
  url: null,
  description: message,
});
```

### Error Propagation Example

```typescript
// foundation layer
const parseLock = (data: unknown): Result<..., ParseBunLockError> => {
  if (!isValid(data)) {
    return err("invalid-document");
  }
  return ok(parsed);
};

// app layer
const service = {
  async scan(lock: unknown): Result<..., SecurityServiceError> {
    const parsed = parseLock(lock);
    if (!parsed.ok) {
      return err({ type: "lock-parse-error", error: parsed.error });
    }
    // Continue processing...
  }
};

// boot layer
const scanner = {
  async scan({ packages }) {
    const result = await service.scan(lock);
    if (!result.ok) {
      return [buildFatalAdvisory(describeError(result.error))];
    }
    return result.data;
  }
};
```

## Dependency Injection Pattern

### Capability Records

Instead of classes or DI containers, we use **plain objects with functions**:

```typescript
type SecurityServiceDependencies = {
  readonly parseLock: (lock: unknown) => Result<...>;
  readonly generateSbom: (coords: ...) => SbomDocument;
  readonly classifySeverity: (finding: ...) => AdvisoryLevel | null;
  readonly osvScanner: OsvScannerPort;
};
```

### Factory Functions

```typescript
export const createSecurityService = (
  dependencies: SecurityServiceDependencies
): SecurityService => {
  return {
    async scan(lock) {
      // Use injected dependencies
      const parsed = dependencies.parseLock(lock);
      const sbom = dependencies.generateSbom(parsed.data);
      const result = await dependencies.osvScanner.scan(sbom);
      // ...
    }
  };
};
```

### Benefits

1. **Testability** - Easy to inject stubs:

```typescript
const stubService = createSecurityService({
  parseLock: () => ok([]),
  generateSbom: () => ({ ... }),
  classifySeverity: () => "fatal",
  osvScanner: { scan: async () => ok({ results: [] }) },
});
```

2. **No hidden dependencies** - All deps explicit in signature
3. **No framework magic** - Just functions and objects
4. **Composable** - Can nest factories:

```typescript
const scanner = createScanner({
  securityService: createSecurityService({
    osvScanner: createOsvScannerCliAdapter(),
  }),
});
```

## Port/Adapter Pattern

### Port Definition (Interface)

```typescript
// ports/osvScannerPort.ts
export type OsvScannerPort = {
  readonly scan: (
    sbomJson: string
  ) => Promise<Result<OsvScanResultsBody, OsvScannerError>>;
};
```

### Real Adapter (Production)

```typescript
// adapters/osvScannerCli.ts
export const createOsvScannerCliAdapter = (): OsvScannerPort => ({
  async scan(sbomJson) {
    // Real I/O: spawn process, read files
    const tempFile = await writeTempFile(sbomJson);
    const process = Bun.spawn({ cmd: ["osv-scanner", ...] });
    return parseOutput(await process.text());
  }
});
```

### Stub Adapter (Testing)

```typescript
// ports/osvScannerPort.ts
export const createStubOsvScannerPort = (
  payload: Result<OsvScanResultsBody, OsvScannerError>
): OsvScannerPort => ({
  scan: async () => payload,
});

// Usage in tests
const stubScanner = createStubOsvScannerPort(ok({ results: [] }));
```

### Benefits

- **Core logic doesn't know about CLI** - Only knows about the port
- **Easy to swap implementations** - CLI → HTTP API → Mock
- **Testable without side effects** - Use stub adapter in tests

## SBOM Generation

### CycloneDX Format

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "components": [
    {
      "type": "library",
      "name": "event-stream",
      "version": "3.3.6",
      "purl": "pkg:npm/event-stream@3.3.6"
    }
  ]
}
```

### Implementation

```typescript
export const generateCycloneDxSbom = (
  coordinates: DependencyCoordinate[]
): SbomDocument => ({
  bomFormat: SBOM_FORMAT_CYCLONEDX,
  specVersion: SBOM_SPEC_VERSION_1_4,
  version: 1,
  components: coordinates.map(coord => ({
    type: SBOM_COMPONENT_TYPE_LIBRARY,
    name: coord.name,
    version: coord.version,
    purl: toPackageUrl(coord.ecosystem, coord.name, coord.version),
  })),
});
```

### PURL (Package URL) Format

```
pkg:{ecosystem}/{name}@{version}

Examples:
  pkg:npm/event-stream@3.3.6
  pkg:npm/@types/node@20.0.0
  pkg:pypi/django@4.2.0
```

## Severity Classification Algorithm

### Decision Tree

```
1. Check textual labels (database_specific.severity)
   ├─ "CRITICAL" or "HIGH" → fatal
   └─ Continue...

2. Check numeric CVSS scores
   ├─ CVSS >= 7.0 → fatal
   └─ Continue...

3. Check textual labels again
   ├─ "MODERATE" or "LOW" → warn
   └─ Continue...

4. Check numeric CVSS scores again
   ├─ CVSS >= 4.0 → warn
   └─ Return null (no advisory)
```

### Implementation

```typescript
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => {
  const labels = collectSeverityLabels(finding);
  
  // Fatal: HIGH/CRITICAL labels
  if (labels.some(label => FATAL_LABELS.has(label))) {
    return ADVISORY_LEVEL_FATAL;
  }
  
  // Fatal: CVSS >= 7.0
  const numericSeverity = findMaxNumericSeverity(finding);
  if (numericSeverity !== null && numericSeverity >= 7.0) {
    return ADVISORY_LEVEL_FATAL;
  }
  
  // Warn: MODERATE/LOW labels
  if (labels.some(label => WARN_LABELS.has(label))) {
    return ADVISORY_LEVEL_WARN;
  }
  
  // Warn: CVSS >= 4.0
  if (numericSeverity !== null && numericSeverity >= 4.0) {
    return ADVISORY_LEVEL_WARN;
  }
  
  return null; // Ignore (e.g., informational)
};
```

### Rationale

- **Two-tier system** - Aligns with Bun's API (fatal vs. warn)
- **Dual signals** - Uses both labels and CVSS scores
- **Conservative defaults** - High/Critical → fatal (block installs)
- **Graceful degradation** - Returns null if no clear severity

## Testability Design

### Pure Functions First

```typescript
// Easy to test: no I/O
test("classifies CRITICAL as fatal", () => {
  const finding = { vulnerabilities: [{ severity: "CRITICAL" }] };
  expect(classifyPackageSeverity(finding)).toBe("fatal");
});
```

### Dependency Injection

```typescript
// Easy to test: inject stubs
const service = createSecurityService({
  parseLock: () => ok([{ name: "test", version: "1.0.0" }]),
  osvScanner: stubScanner,
});
```

### Layered Isolation

```typescript
// Test foundation layer alone
test("parseBunLock", () => {
  const result = parseBunLock({ packages: { ... } });
  expect(result.ok).toBe(true);
});

// Test core layer alone
test("generateSbom", () => {
  const sbom = generateCycloneDxSbom([{ ... }]);
  expect(sbom.components).toHaveLength(1);
});

// Test app layer with stubs
test("securityService", async () => {
  const service = createSecurityService({
    parseLock: stubParseLock,
    osvScanner: stubScanner,
  });
  const result = await service.scan({});
  expect(result.ok).toBe(true);
});
```

### Fixture-Driven Validation

```typescript
// Use real OSV output as test fixture
const fixture = await loadFixture("fixtures/osv/event-stream-osv.json");

test("handles real OSV output", async () => {
  const service = createSecurityService({
    osvScanner: { scan: async () => ok(fixture) },
    // ...
  });
  const result = await service.scan({});
  expect(result.data[0].level).toBe("fatal");
});
```

## Summary

This architecture achieves:

1. **Separation of concerns** - Each layer has a clear responsibility
2. **Pure business logic** - Core/foundation are side-effect-free
3. **Testability** - Pure functions + dependency injection
4. **Flexibility** - Easy to swap implementations (CLI → API)
5. **Type safety** - Explicit error handling with `Result<T, E>`
6. **Maintainability** - Clear boundaries prevent coupling

The result is a codebase that's easy to understand, test, and migrate to other platforms (e.g., Rails).
