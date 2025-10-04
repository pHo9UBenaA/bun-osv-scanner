# Code Style and Conventions

This document describes all coding standards, conventions, and style guidelines used in this project.

## Philosophy

This project follows three core principles:

1. **Test-Driven Development (TDD)** - Write tests first (t_wada style)
2. **YAGNI (You Aren't Gonna Need It)** - Don't add features until needed
3. **Baby Steps** - Small, incremental changes with frequent testing

## Programming Paradigm

### Functional Programming (FP)

**All code must be written in functional style.**

#### ✅ DO: Pure Functions

```typescript
// Good: Pure function with explicit types
const toPackageUrl = (
  ecosystem: string,
  name: string,
  version: string,
): string => {
  return `pkg:${ecosystem}/${name}@${version}`;
};
```

#### ❌ DON'T: Classes or Object-Oriented

```typescript
// Bad: Classes are not allowed
class PackageUrlBuilder {
  constructor(private ecosystem: string) {}
  build(name: string, version: string): string { ... }
}
```

#### ✅ DO: Single Responsibility Functions

```typescript
// Good: Each function does one thing
const validateUser = (user: User): ValidationResult => { ... };
const saveUser = (user: User): SaveResult => { ... };

// Compose them
const registerUser = (user: User) => {
  const validation = validateUser(user);
  if (!validation.ok) return validation;
  return saveUser(user);
};
```

#### ❌ DON'T: God Functions

```typescript
// Bad: Function doing too many things
const processUserRegistration = (user: User) => {
  // validates, saves, sends email, logs, etc.
};
```

### Algebraic Data Types (ADTs)

**Model domains using discriminated unions and readonly types.**

#### ✅ DO: Result Type Pattern

```typescript
// Good: Explicit success/failure modeling
type Result<T, E> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

const ok = <T, E>(data: T): Result<T, E> => 
  ({ ok: true, data });

const err = <T, E>(error: E): Result<T, E> => 
  ({ ok: false, error });
```

#### ✅ DO: Discriminated Unions for Errors

```typescript
// Good: Type-safe error variants
type SecurityServiceError =
  | { readonly type: "lock-parse-error"; readonly error: ParseBunLockError }
  | { readonly type: "sbom-serialization-error"; readonly message: string }
  | { readonly type: "osv-scan-error"; readonly error: OsvScannerError };
```

#### ❌ DON'T: Throw Exceptions

```typescript
// Bad: Exceptions are not used in this codebase
const parseLock = (data: unknown): Coordinates => {
  if (!isValid(data)) {
    throw new Error("Invalid lock");  // Never do this
  }
  return parse(data);
};

// Good: Return Result type
const parseLock = (data: unknown): Result<Coordinates, ParseError> => {
  if (!isValid(data)) {
    return err(PARSE_ERROR_INVALID_DOCUMENT);
  }
  return ok(parse(data));
};
```

## Layered Architecture

### Dependency Direction Rules

**Dependencies must flow inward (toward abstractions):**

```
foundation (no dependencies)
    ↑
  core (depends on: foundation)
    ↑
  ports (depends on: foundation)
    ↑
   app (depends on: core, ports, foundation)
    ↑
adapters (depends on: core, ports, foundation) **NEVER app**
    ↑
  boot (depends on: everything)
```

### Layer Responsibilities

#### 1. `foundation/` - Pure Utilities

**Zero dependencies. Pure functions only.**

```typescript
// foundation/bunLockParser.ts
export const parseBunLock = (
  document: unknown
): Result<DependencyCoordinate[], ParseBunLockError> => {
  // Pure logic, no I/O, no external dependencies
};
```

#### 2. `core/` - Business Logic

**Depends only on `foundation/`. Pure functions only.**

```typescript
// core/severity.ts
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => {
  // Pure business logic
  // No I/O, no side effects
};
```

#### 3. `ports/` - Abstract Interfaces

**Depends only on `foundation/`. Defines contracts.**

```typescript
// ports/osvScannerPort.ts
export type OsvScannerPort = {
  readonly scan: (
    sbomJson: string
  ) => Promise<Result<OsvScanResultsBody, OsvScannerError>>;
};
```

#### 4. `app/` - Orchestration

**Depends on `core`, `ports`, `foundation`. Coordinates workflows.**

```typescript
// app/securityService.ts
export const createSecurityService = (
  dependencies: SecurityServiceDependencies
): SecurityService => {
  return {
    async scan(lock) {
      // Orchestrates: parse → generate → scan → build
      const parsed = dependencies.parseLock(lock);
      const sbom = dependencies.generateSbom(parsed.data);
      const result = await dependencies.osvScanner.scan(sbom);
      return buildAdvisories(result);
    }
  };
};
```

#### 5. `adapters/` - Side Effects

**Depends on `core`, `ports`, `foundation`. Contains ALL I/O.**

```typescript
// adapters/osvScannerCli.ts
export const createOsvScannerCliAdapter = (): OsvScannerPort => {
  return {
    async scan(sbomJson) {
      // File I/O, process execution
      const tempFile = await writeFile(sbomJson);
      const process = Bun.spawn({ cmd: ["osv-scanner", ...] });
      // ...
    }
  };
};
```

#### 6. `boot/` - Composition Root

**Wires everything together. Entry point.**

```typescript
// boot/scanner.ts
export const createScanner = (
  options: CreateScannerOptions = {}
): Bun.Security.Scanner => {
  // Dependency injection: compose all layers
  const osvScanner = options.osvScanner ?? createOsvScannerCliAdapter();
  const securityService = createSecurityService({
    parseLock: parseBunLock,
    generateSbom: generateCycloneDxSbom,
    osvScanner,
  });
  
  return { version: "1", scan: ... };
};
```

### ❌ DON'T: Violate Dependency Rules

```typescript
// Bad: adapter importing from app
import { securityService } from "../app/securityService";  // Never!

// Bad: core importing from adapter
import { osvScannerCli } from "../adapters/osvScannerCli";  // Never!

// Bad: circular dependency
// core/severity.ts imports from app/securityService.ts
// app/securityService.ts imports from core/severity.ts
// This creates a cycle!
```

## Dependency Injection

### ✅ DO: Function-Based Injection

```typescript
// Good: Inject capabilities as function parameters
type SecurityServiceDependencies = {
  readonly parseLock: (lock: unknown) => Result<...>;
  readonly generateSbom: (coords: ...) => SbomDocument;
  readonly osvScanner: OsvScannerPort;
};

const createSecurityService = (
  dependencies: SecurityServiceDependencies
): SecurityService => { ... };
```

### ❌ DON'T: Global State or Singletons

```typescript
// Bad: Global singleton
const globalScanner = new OsvScanner();
export { globalScanner };

// Bad: Module-level side effects
const config = loadConfigFromEnv();  // Side effect at module load!
```

## Domain Modeling

### Type Aggregation

**Aggregate related domain types in `src/types/<domain>.ts`**

```typescript
// types/dependency.ts
export type DependencyEcosystem = string;
export type DependencyVersion = string;
export type DependencyName = string;
export type DependencyCoordinate = {
  readonly name: DependencyName;
  readonly version: DependencyVersion;
  readonly ecosystem: DependencyEcosystem;
};
```

### Naming Conventions

#### Constants

```typescript
// Screaming snake case for constants
export const OSV_SEVERITY_LABEL_CRITICAL = "CRITICAL" as const;
export const ADVISORY_LEVEL_FATAL = "fatal" as const;
export const PARSE_ERROR_INVALID_DOCUMENT = "invalid-document" as const;
```

#### Types

```typescript
// PascalCase for types
export type OsvVulnerability = { ... };
export type SecurityServiceError = { ... };
export type DependencyCoordinate = { ... };
```

#### Functions

```typescript
// camelCase for functions
export const parseBunLock = ...;
export const classifyPackageSeverity = ...;
export const generateCycloneDxSbom = ...;
```

#### Factory Functions

```typescript
// Prefix with "create" for factories
export const createSecurityService = ...;
export const createScanner = ...;
export const createOsvScannerCliAdapter = ...;
```

## Magic Literals

### ❌ DON'T: Inline Magic Values

```typescript
// Bad: Magic string
if (user.role === "admin") { ... }

// Bad: Magic number
if (score >= 7.0) { ... }
```

### ✅ DO: Extract as Constants

```typescript
// Good: Named constant
const ROLE_ADMIN = "admin" as const;
if (user.role === ROLE_ADMIN) { ... }

// Good: Documented threshold
const FATAL_CVSS_THRESHOLD = 7.0;
if (score >= FATAL_CVSS_THRESHOLD) { ... }
```

## Module Scoping

### ✅ DO: Proper Scoping

```typescript
// Good: Module-scoped helper (not exported)
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

// Good: Exported public API
export const parseBunLock = (document: unknown): Result<...> => {
  if (!isRecord(document)) { ... }
};
```

### ❌ DON'T: Over-export

```typescript
// Bad: Exporting internal helpers unnecessarily
export const isRecord = ...;  // Only used internally
export const toCoordinate = ...;  // Only used internally

// This creates unnecessary coupling and surface area
```

## Comments and Documentation

### JSDoc Format

**All comments must be in English using JSDoc.**

#### File Headers

```typescript
/**
 * @file Core logic for mapping OSV severities to Bun advisory levels.
 */
```

#### Function Documentation

```typescript
/**
 * Determine the advisory level Bun should return for the supplied package finding.
 *
 * Evaluates both textual severity labels (CRITICAL, HIGH, etc.) and numeric
 * CVSS scores to determine whether a vulnerability should be treated as fatal
 * or warning.
 */
export const classifyPackageSeverity = (
  finding: OsvPackageFinding
): AdvisoryLevel | null => { ... };
```

#### What to Document

- **File purpose** - What domain/layer does this file belong to?
- **Function purpose** - What does this function do? (the "What")
- **Function reasoning** - Why does this function exist? (the "Why")
- **Complex algorithms** - How does the logic work? (the "How")

#### What NOT to Document

```typescript
// Bad: Obvious comments
const x = 5;  // Set x to 5

// Bad: Redundant JSDoc
/**
 * Gets the name.
 * @returns The name.
 */
const getName = () => name;
```

### Type Annotations

```typescript
// Good: Use JSDoc for complex types
/**
 * Represents the outcome of a computation that may fail.
 * 
 * @template T - The success value type
 * @template E - The error type
 */
export type Result<T, E> = ...;
```

## Code Organization

### Early Returns

**Prefer early returns to reduce nesting.**

#### ✅ DO: Early Returns

```typescript
// Good: Flat structure
const processUser = (user: User): Result<...> => {
  if (!user.email) {
    return err("email-required");
  }
  
  if (!user.name) {
    return err("name-required");
  }
  
  return ok(save(user));
};
```

#### ❌ DON'T: Deep Nesting

```typescript
// Bad: Nested structure
const processUser = (user: User): Result<...> => {
  if (user.email) {
    if (user.name) {
      return ok(save(user));
    } else {
      return err("name-required");
    }
  } else {
    return err("email-required");
  }
};
```

### Remove Dead Code

**Delete commented code and unused functions immediately.**

```typescript
// Bad: Commented old code
// const oldFunction = () => { ... };

// Bad: Unused export
export const unusedHelper = () => { ... };

// Good: Only keep what's actively used
export const activeFunction = () => { ... };
```

## TypeScript Configuration

### Strict Mode

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Import Style

```typescript
// Good: Named imports
import { parseBunLock } from "../foundation/bunLockParser";
import type { Result } from "../types/result";

// Good: Separate type imports
import type { OsvVulnerability } from "../types/osv";
```

## Formatting Rules (Biome)

- **Indentation**: Tabs (not spaces)
- **Quotes**: Double quotes (`"`)
- **Semicolons**: Required
- **Trailing commas**: Allowed
- **Line width**: No explicit limit (rely on formatter)

## Testing Conventions

### Test Structure

```typescript
import { describe, expect, test } from "bun:test";

describe("functionName", () => {
  test("describes expected behavior", () => {
    // Arrange
    const input = { ... };
    
    // Act
    const result = functionName(input);
    
    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Test File Naming

- Place tests next to implementation: `severity.ts` → `severity.test.ts`
- Use descriptive test names: `"returns fatal for critical vulnerabilities"`

## Summary Checklist

Before committing code, verify:

- ✅ No classes (only functions)
- ✅ All errors use `Result<T, E>` (no exceptions)
- ✅ Dependency direction is correct (inward flow)
- ✅ Magic literals extracted to constants
- ✅ JSDoc comments in English
- ✅ Early returns used (minimal nesting)
- ✅ No dead code or commented code
- ✅ Tests pass: `bun test`
- ✅ Lint passes: `bun run lint`
- ✅ Types pass: `bun run typecheck`
- ✅ Format passes: `bun run check`
