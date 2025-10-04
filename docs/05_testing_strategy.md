# Testing Strategy

This document describes the comprehensive testing approach used in the bun-osv-scanner project.

## Testing Philosophy

### TDD (Test-Driven Development)

This project follows **t_wada style TDD**:

1. **Red** - Write a failing test first
2. **Green** - Write minimal code to make it pass
3. **Refactor** - Improve code while keeping tests green

### Baby Steps

- Make small, incremental changes
- Run tests after each change
- Never write more code than needed (YAGNI)

### Test Coverage Goals

- **100% coverage** for pure functions (foundation, core)
- **High coverage** for application services (app)
- **Integration tests** for boot layer
- **Stub-based tests** for adapters

## Test Organization

### Test File Placement

Tests are co-located with implementation files:

```
src/
├── foundation/
│   ├── bunLockParser.ts
│   └── bunLockParser.test.ts
├── core/
│   ├── severity.ts
│   ├── severity.test.ts
│   ├── sbomGenerator.ts
│   └── sbomGenerator.test.ts
├── adapters/
│   ├── osvScannerCli.ts
│   └── osvScannerCli.test.ts
├── app/
│   ├── securityService.ts
│   └── securityService.test.ts
└── boot/
    ├── scanner.ts
    └── scanner.test.ts
```

### Test Structure

```typescript
import { describe, expect, test } from "bun:test";

describe("functionName or moduleName", () => {
  test("describes expected behavior in plain English", () => {
    // Arrange: Set up test data
    const input = { ... };
    
    // Act: Execute the function under test
    const result = functionName(input);
    
    // Assert: Verify the outcome
    expect(result).toEqual(expected);
  });
  
  test("describes another behavior", () => {
    // ...
  });
});
```

## Layer-by-Layer Testing Strategy

### Foundation Layer: Unit Tests

**Goal:** Test pure functions in isolation

**Example: `bunLockParser.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import {
  parseBunLock,
  PARSE_ERROR_INVALID_DOCUMENT,
  PARSE_ERROR_MISSING_PACKAGES,
} from "./bunLockParser";

describe("parseBunLock", () => {
  test("parses dependency coordinates from bun.lock-like object", () => {
    const lockData = {
      packages: {
        "oxlint@1.19.0": ["1.19.0"],
        "@types/node@20.0.0": ["20.0.0"],
      },
    };
    
    const result = parseBunLock(lockData);
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.data).toEqual([
      { name: "oxlint", version: "1.19.0", ecosystem: "npm" },
      { name: "@types/node", version: "20.0.0", ecosystem: "npm" },
    ]);
  });
  
  test("returns error when document is not an object", () => {
    const result = parseBunLock(null);
    expect(result).toEqual({ ok: false, error: PARSE_ERROR_INVALID_DOCUMENT });
  });
  
  test("returns error when packages record is missing", () => {
    const result = parseBunLock({});
    expect(result).toEqual({ ok: false, error: PARSE_ERROR_MISSING_PACKAGES });
  });
  
  test("filters out malformed package entries", () => {
    const lockData = {
      packages: {
        "valid@1.0.0": ["1.0.0"],
        "invalid": null,          // Malformed
        "empty@": [""],            // Empty version
      },
    };
    
    const result = parseBunLock(lockData);
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("valid");
  });
});
```

**Key patterns:**
- Test happy path first
- Test error cases (boundary conditions)
- Test edge cases (malformed input, empty values)
- Use type guards (`if (!result.ok) return;`) for type safety

### Core Layer: Unit Tests

**Goal:** Test business logic without side effects

**Example: `severity.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import {
  classifyPackageSeverity,
  ADVISORY_LEVEL_FATAL,
  ADVISORY_LEVEL_WARN,
} from "./severity";
import type { OsvPackageFinding } from "../types/osv";

describe("classifyPackageSeverity", () => {
  test("returns fatal for CRITICAL severity label", () => {
    const finding: OsvPackageFinding = {
      package: { name: "test", version: "1.0.0", ecosystem: "npm" },
      vulnerabilities: [{
        id: "TEST-001",
        summary: "Test vulnerability",
        severity: [],
        affected: [],
        database_specific: { severity: "CRITICAL" },
      }],
    };
    
    expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_FATAL);
  });
  
  test("returns fatal for HIGH severity label", () => {
    const finding: OsvPackageFinding = {
      package: { name: "test", version: "1.0.0", ecosystem: "npm" },
      vulnerabilities: [{
        id: "TEST-002",
        summary: "Test vulnerability",
        severity: [],
        affected: [],
        database_specific: { severity: "HIGH" },
      }],
    };
    
    expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_FATAL);
  });
  
  test("returns fatal for CVSS score >= 7.0", () => {
    const finding: OsvPackageFinding = {
      package: { name: "test", version: "1.0.0", ecosystem: "npm" },
      vulnerabilities: [{
        id: "TEST-003",
        summary: "Test vulnerability",
        severity: [{ type: "CVSS_V3", score: "7.5" }],
        affected: [],
      }],
      groups: [{ ids: ["TEST-003"], maxSeverity: "7.5" }],
    };
    
    expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_FATAL);
  });
  
  test("returns warn for MODERATE severity label", () => {
    const finding: OsvPackageFinding = {
      package: { name: "test", version: "1.0.0", ecosystem: "npm" },
      vulnerabilities: [{
        id: "TEST-004",
        summary: "Test vulnerability",
        severity: [],
        affected: [],
        database_specific: { severity: "MODERATE" },
      }],
    };
    
    expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_WARN);
  });
  
  test("returns null for no severity signals", () => {
    const finding: OsvPackageFinding = {
      package: { name: "test", version: "1.0.0", ecosystem: "npm" },
      vulnerabilities: [{
        id: "TEST-005",
        summary: "Test vulnerability",
        severity: [],
        affected: [],
      }],
    };
    
    expect(classifyPackageSeverity(finding)).toBe(null);
  });
});
```

**Key patterns:**
- Test each decision branch (critical, high, moderate, low, null)
- Use type-complete mock data
- Test numeric thresholds (7.0, 4.0)
- Test precedence (fatal > warn > null)

### Adapters Layer: Integration Tests

**Goal:** Test I/O adapters with controlled side effects

**Example: `osvScannerCli.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import { createOsvScannerCliAdapter } from "./osvScannerCli";
import { ok, err } from "../types/result";

describe("createOsvScannerCliAdapter", () => {
  test("returns parsed JSON when command succeeds", async () => {
    let capturedArgs: string[] = [];
    
    const adapter = createOsvScannerCliAdapter({
      run: async (cmd) => {
        capturedArgs = [...cmd];
        return {
          exitCode: 0,
          stdout: JSON.stringify({ results: [] }),
          stderr: "",
        };
      },
      tempFiles: {
        async create(contents) {
          return {
            path: "/tmp/test.json",
            async dispose() {},
          };
        },
      },
    });
    
    const sbomJson = '{"bomFormat":"CycloneDX"}';
    const result = await adapter.scan(sbomJson);
    
    expect(result).toEqual(ok({ results: [] }));
    expect(capturedArgs).toContain("/tmp/test.json");
  });
  
  test("returns process-failed error when exit code is non-zero", async () => {
    const adapter = createOsvScannerCliAdapter({
      run: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "osv-scanner: command not found",
      }),
      tempFiles: {
        async create() {
          return { path: "/tmp/test.json", async dispose() {} };
        },
      },
    });
    
    const result = await adapter.scan("{}");
    
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("process-failed");
    expect(result.error.message).toContain("command not found");
  });
  
  test("returns decode-error when output is not JSON", async () => {
    const adapter = createOsvScannerCliAdapter({
      run: async () => ({
        exitCode: 0,
        stdout: "not json",
        stderr: "",
      }),
      tempFiles: {
        async create() {
          return { path: "/tmp/test.json", async dispose() {} };
        },
      },
    });
    
    const result = await adapter.scan("{}");
    
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("decode-error");
  });
});
```

**Key patterns:**
- **Inject test doubles** - Replace `run` and `tempFiles` with stubs
- **Capture arguments** - Verify correct CLI invocation
- **Test error paths** - Non-zero exit codes, malformed output
- **Avoid real I/O** - Use stub implementations

### App Layer: Service Tests

**Goal:** Test orchestration logic with stub dependencies

**Example: `securityService.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import { createSecurityService } from "./securityService";
import { generateCycloneDxSbom } from "../core/sbomGenerator";
import { classifyPackageSeverity } from "../core/severity";
import { PARSE_ERROR_INVALID_DOCUMENT } from "../foundation/bunLockParser";
import { ok, err } from "../types/result";

const loadFixture = async (path: string) => {
  const file = Bun.file(path);
  return await file.json();
};

describe("createSecurityService", () => {
  test("returns advisories when OSV scan reports vulnerabilities", async () => {
    const fixture = await loadFixture("fixtures/osv/event-stream-osv.json");
    
    let capturedSbomJson: string | null = null;
    
    const service = createSecurityService({
      parseLock: () => ok([
        { ecosystem: "npm", name: "event-stream", version: "3.3.6" }
      ]),
      generateSbom: generateCycloneDxSbom,
      classifySeverity: classifyPackageSeverity,
      osvScanner: {
        scan: async (sbomJson) => {
          capturedSbomJson = sbomJson;
          return ok(fixture);
        },
      },
    });
    
    const result = await service.scan({});
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(typeof capturedSbomJson).toBe("string");
    expect(result.data).toEqual([{
      level: "fatal",
      package: "event-stream",
      url: "https://github.com/advisories/GHSA-mh6f-8j2x-4483",
      description: expect.stringContaining("Critical severity"),
    }]);
  });
  
  test("propagates lock parse errors", async () => {
    const service = createSecurityService({
      parseLock: () => err(PARSE_ERROR_INVALID_DOCUMENT),
      generateSbom: generateCycloneDxSbom,
      classifySeverity: classifyPackageSeverity,
      osvScanner: { scan: async () => ok({ results: [] }) },
    });
    
    const result = await service.scan({});
    
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("lock-parse-error");
  });
  
  test("propagates osv scan errors", async () => {
    const scanError = { type: "process-failed", message: "boom" };
    
    const service = createSecurityService({
      parseLock: () => ok([]),
      generateSbom: generateCycloneDxSbom,
      classifySeverity: classifyPackageSeverity,
      osvScanner: { scan: async () => err(scanError) },
    });
    
    const result = await service.scan({});
    
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("osv-scan-error");
  });
});
```

**Key patterns:**
- **Fixture-driven testing** - Use real OSV output
- **Stub all dependencies** - Control inputs/outputs
- **Test happy path** - Verify full workflow
- **Test error propagation** - Verify each error path

### Boot Layer: Integration Tests

**Goal:** Test the full scanner with stubbed I/O

**Example: `scanner.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import { createScanner } from "./scanner";
import type { SecurityService } from "../app/securityService";
import { ok, err } from "../types/result";

const createStubService = (
  result: Awaited<ReturnType<SecurityService["scan"]>>
): SecurityService => ({
  scan: async () => result,
});

describe("scanner", () => {
  test("returns advisories from security service", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(ok([{
        level: "fatal",
        package: "event-stream",
        url: "https://example.com",
        description: "Test vulnerability",
      }])),
    });
    
    const advisories = await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });
    
    expect(advisories).toEqual([{
      level: "fatal",
      package: "event-stream",
      url: "https://example.com",
      description: "Test vulnerability",
    }]);
  });
  
  test("returns empty array when no packages", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(ok([])),
    });
    
    const advisories = await scanner.scan({ packages: [] });
    expect(advisories).toEqual([]);
  });
  
  test("returns fatal advisory when lock read fails", async () => {
    const scanner = createScanner({
      readLock: async () => err({
        type: "lock-read-error",
        message: "ENOENT",
      }),
      securityService: createStubService(ok([])),
    });
    
    const advisories = await scanner.scan({
      packages: [{ name: "test", version: "1.0.0" }],
    });
    
    expect(advisories).toEqual([{
      level: "fatal",
      package: "bun.lock",
      url: null,
      description: "Failed to read bun.lock: ENOENT",
    }]);
  });
  
  test("returns fatal advisory when service fails", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(err({
        type: "osv-scan-error",
        error: { type: "process-failed", message: "CLI error" },
      })),
    });
    
    const advisories = await scanner.scan({
      packages: [{ name: "test", version: "1.0.0" }],
    });
    
    expect(advisories).toEqual([{
      level: "fatal",
      package: "bun.lock",
      url: null,
      description: expect.stringContaining("CLI error"),
    }]);
  });
});
```

**Key patterns:**
- **Stub external I/O** - `readLock`, `securityService`
- **Test end-to-end flow** - From scanner API to advisories
- **Test error handling** - All error paths return fatal advisories

## Fixture Management

### Purpose

Fixtures provide real-world data for testing:
- **SBOM fixtures** - Example CycloneDX documents
- **OSV fixtures** - Real OSV scanner output

### Location

```
fixtures/
├── sbom/
│   └── sample-sbom.cdx.json
└── osv/
    └── event-stream-osv.json
```

### Loading Fixtures

```typescript
const loadFixture = async (path: string) => {
  const file = Bun.file(path);
  return await file.json();
};

// Usage
const osvData = await loadFixture("fixtures/osv/event-stream-osv.json");
```

### When to Use Fixtures

- ✅ Testing parser logic with real data
- ✅ Integration tests that need realistic payloads
- ✅ Regression tests (capture real-world bugs)
- ❌ Simple unit tests (prefer inline data)

## Running Tests

### Run All Tests

```bash
bun test
```

### Run Specific Test File

```bash
bun test src/core/severity.test.ts
```

### Run Tests with Filter

```bash
bun test --filter "classifies CRITICAL"
```

### Watch Mode

```bash
bun test --watch
```

## Test Coverage

### Expected Coverage

| Layer | Target Coverage | Reasoning |
|-------|----------------|-----------|
| `foundation/` | 100% | Pure functions, no excuses |
| `core/` | 100% | Business logic must be tested |
| `ports/` | N/A | Only type definitions |
| `app/` | 90%+ | Orchestration logic |
| `adapters/` | 80%+ | I/O code, harder to test |
| `boot/` | 80%+ | Composition logic |

### Checking Coverage

```bash
# Bun doesn't have built-in coverage yet
# Manual verification: Review test files
```

## Common Testing Patterns

### Pattern 1: Type Guard After Result Check

```typescript
const result = functionThatReturnsResult();
expect(result.ok).toBe(true);
if (!result.ok) return;  // Type guard
// TypeScript now knows result.data exists
expect(result.data.length).toBe(1);
```

### Pattern 2: Stub Factory

```typescript
const createStubOsvScanner = (data: any): OsvScannerPort => ({
  scan: async () => ok(data),
});

// Usage
const scanner = createStubOsvScanner({ results: [] });
```

### Pattern 3: Argument Capture

```typescript
let capturedArg: string | null = null;
const stub = {
  method: (arg: string) => {
    capturedArg = arg;
    return ok({});
  },
};

// ... use stub ...

expect(capturedArg).toBe("expected value");
```

### Pattern 4: Error Assertion

```typescript
const result = await functionThatMayFail();
expect(result.ok).toBe(false);
if (result.ok) return;  // Type guard
expect(result.error.type).toBe("expected-error-type");
expect(result.error.message).toContain("expected substring");
```

## Testing Anti-Patterns

### ❌ DON'T: Test Implementation Details

```typescript
// Bad: Testing internal helper functions
test("isRecord returns true for objects", () => {
  expect(isRecord({})).toBe(true);
});

// Good: Test public API
test("parseBunLock accepts object input", () => {
  expect(parseBunLock({})).toEqual(...);
});
```

### ❌ DON'T: Use Real File I/O

```typescript
// Bad: Reading actual files in tests
test("reads bun.lock", async () => {
  const data = await Bun.file("bun.lock").json();
  // ...
});

// Good: Use stub or fixture
test("reads bun.lock", async () => {
  const readLock = async () => ok({ packages: {} });
  // ...
});
```

### ❌ DON'T: Test Multiple Concerns

```typescript
// Bad: Testing too much at once
test("parses lock, generates SBOM, and scans for vulnerabilities", () => {
  // This should be 3 separate tests
});

// Good: One concern per test
test("parses lock into coordinates", () => { ... });
test("generates SBOM from coordinates", () => { ... });
test("scans SBOM for vulnerabilities", () => { ... });
```

## Summary Checklist

Before committing:
- ✅ All tests pass (`bun test`)
- ✅ New features have tests (TDD)
- ✅ Error paths are tested
- ✅ Edge cases are covered
- ✅ Test names describe behavior
- ✅ Tests are isolated (no shared state)
- ✅ Stubs used instead of real I/O
- ✅ Fixtures used for complex data

## Continuous Testing

During development:
1. Run tests after each change
2. Keep tests green always
3. Refactor with confidence (tests catch breaks)
4. Write test first (red → green → refactor)
