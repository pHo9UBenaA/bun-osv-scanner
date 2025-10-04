# Onboarding Summary

Welcome to the bun-osv-scanner project! This document provides a quick overview and reading guide for all onboarding documentation.

## Quick Start

**Before you begin, read these documents in order:**

1. **[01_project_overview.md](./01_project_overview.md)** - Understand what this project does and why
2. **[02_development_commands.md](./02_development_commands.md)** - Learn the daily development workflow
3. **[03_code_style_and_conventions.md](./03_code_style_and_conventions.md)** - Learn coding standards

**For deeper understanding:**

4. **[04_architecture_deep_dive.md](./04_architecture_deep_dive.md)** - Explore architectural patterns
5. **[05_testing_strategy.md](./05_testing_strategy.md)** - Understand testing approach
6. **[06_rails_migration_guide.md](./06_rails_migration_guide.md)** - Guide for porting to Rails

## What is This Project?

bun-osv-scanner is a **security scanner plugin for Bun** that:
- Scans npm packages for known vulnerabilities during `bun install`
- Queries the OSV (Open Source Vulnerability) database
- Blocks or warns about vulnerable packages based on severity
- Demonstrates functional programming and clean architecture patterns

## Tech Stack Overview

| Component | Technology |
|-----------|-----------|
| Runtime | Bun (JavaScript/TypeScript runtime) |
| Language | TypeScript (strict mode) |
| Vulnerability Data | OSV REST API (default) / `osv-scanner` CLI (optional) |
| Linter | Oxlint (Rust-based) |
| Formatter | Biome |
| Type Checker | tsgo + tsc |
| Test Runner | Bun's built-in test runner |

## Architecture at a Glance

```
┌─────────────────────────────────────┐
│  boot/     (Composition)            │
│  scanner.ts                         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  adapters/  (Side Effects)          │
│  osvScannerApi.ts, osvScannerCli.ts │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  app/       (Orchestration)         │
│  securityService.ts                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  core/      (Business Logic)        │
│  severity.ts, sbomGenerator.ts      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  foundation/ (Pure Utilities)       │
│  bunLockParser.ts                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  types/     (Domain Types)          │
│  result.ts, osv.ts, dependency.ts   │
└─────────────────────────────────────┘
```

**Key principle:** Dependencies flow inward (downward in diagram).

## Core Principles

### 1. Functional Programming
- No classes, only pure functions
- Algebraic Data Types (ADTs) for domain modeling
- Explicit error handling with `Result<T, E>` type
- No exceptions

### 2. Layered Architecture
- Clear separation of concerns
- Pure vs. impure code separation
- Dependency injection via function parameters
- Testable at every layer

### 3. Test-Driven Development (TDD)
- Write tests first (red → green → refactor)
- Baby steps (small incremental changes)
- YAGNI (You Aren't Gonna Need It)

## Common Commands

```bash
# Daily workflow
bun test              # Run all tests
bun run lint          # Check for code issues
bun run typecheck     # Type checking
bun run check         # Format checking

# Before committing
bun test && bun run lint && bun run typecheck && bun run check

# Formatting
bun run format        # Auto-format code
bun run lint:fix      # Auto-fix lint issues
```

## Key Files to Review

Start exploring the codebase with these files:

### 1. Entry Point
```typescript
// src/index.ts
export { scanner } from "./boot/scanner";
```

### 2. Main Scanner Implementation
```typescript
// src/boot/scanner.ts
export const createScanner = (...) => ({
  version: "1",
  async scan({ packages }) { ... }
});
```

### 3. Core Business Logic
```typescript
// src/core/severity.ts
export const classifyPackageSeverity = (finding) => {
  // Maps OSV severity to Bun advisory level
};
```

### 4. Adapter Examples
```typescript
// src/adapters/osvScannerApi.ts
export const createOsvScannerApiAdapter = ({ fetch, baseUrl }) => ({
  scan: async (sbomJson) => {
    // Calls OSV REST API using querybatch + vulns endpoints
  }
});

// src/adapters/osvScannerCli.ts
export const createOsvScannerCliAdapter = () => ({
  scan: async (sbomJson) => {
    // Invokes local `osv-scanner` CLI process
  }
});
```

### 5. Runtime Configuration
```typescript
// src/app/configureScanner.ts
export const configureScanner = (config) => {
  return config.mode === "cli"
    ? createOsvScannerCliAdapter(config.cli)
    : createOsvScannerApiAdapter({ fetch, ...config.api });
};
```

## Data Flow Example

**How a vulnerability is detected:**

1. Bun calls `scanner.scan({ packages: [...] })`
2. Scanner reads `bun.lock` file
3. Parser extracts dependency coordinates (name, version, ecosystem)
4. Generator creates CycloneDX SBOM from coordinates
5. Adapter calls OSV REST API (or CLI when explicitly configured)
6. Translator converts OSV response into domain findings
7. Classifier determines severity (fatal/warn/null)
8. Service builds advisory objects
9. Scanner returns advisories to Bun
10. Bun displays advisories and decides whether to proceed

## Testing Philosophy

### Test Structure
```typescript
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

### Testing Layers
- **foundation/** - Unit tests, 100% coverage
- **core/** - Unit tests, 100% coverage
- **adapters/** - Integration tests with stubs (REST + CLI adapters)
- **app/** - Service tests with mocked dependencies
- **boot/** - End-to-end tests

## Migration to Rails

This project is designed to be migrated to Ruby on Rails. Key mappings:

| TypeScript/Bun | Ruby/Rails |
|----------------|------------|
| `types/` | Sorbet/RBS types or Value Objects |
| `foundation/` | `lib/` utility modules |
| `core/` | Domain services (`app/services/domain/`) |
| `ports/` | Ruby modules (interfaces) |
| `adapters/` | `app/adapters/` |
| `app/` | Service objects (`app/services/`) |
| `boot/` | Initializers |
| `Result<T, E>` | `dry-monads` gem |
| OSV adapters | OSV HTTP API / CLI bridge |
| `bun.lock` | `Gemfile.lock` |

See [06_rails_migration_guide.md](./06_rails_migration_guide.md) for detailed guidance.

## Documentation Structure

```
docs/
├── 00_onboarding_summary.md          ← You are here
├── 01_project_overview.md            ← Start here
├── 02_development_commands.md        ← Daily workflow
├── 03_code_style_and_conventions.md  ← Coding standards
├── 04_architecture_deep_dive.md      ← Deep architectural details
├── 05_testing_strategy.md            ← Testing approach
├── 06_rails_migration_guide.md       ← Rails porting guide
└── osv-api/                          ← OSV API reference
    ├── README.md
    ├── 01_post-v1-query.md
    ├── 02_post-v1-querybatch.md
    ├── 03_get-v1-vulns.md
    ├── 04_get-v1experimental-importfindings.md
    └── 05_post-v1experimental-determineversion.md
```

## Recommended Reading Order

### For Quick Start (1 hour)
1. 01_project_overview.md (15 min)
2. 02_development_commands.md (15 min)
3. 03_code_style_and_conventions.md (30 min)

### For Deep Understanding (3-4 hours)
1. Quick Start documents (above)
2. 04_architecture_deep_dive.md (60 min)
3. 05_testing_strategy.md (45 min)
4. Browse actual source code (60 min)

### For Rails Migration (2-3 hours)
1. All of the above
2. 06_rails_migration_guide.md (90 min)

## Getting Help

### Documentation Resources
- **Bun Docs**: https://bun.sh/docs
- **Bun Security Scanner API**: https://bun.com/docs/install/security-scanner-api
- **OSV.dev**: https://osv.dev
- **CycloneDX**: https://cyclonedx.org

### Code Examples
- Check test files (`*.test.ts`) for usage examples
- Review fixtures (`fixtures/`) for real data examples
- Read JSDoc comments in source files

### Common Questions

**Q: Why no classes?**
A: Functional programming provides better testability and composability. Pure functions are easier to reason about.

**Q: Why `Result<T, E>` instead of exceptions?**
A: Explicit error handling makes errors part of the type signature. You can't forget to handle them.

**Q: Why layered architecture?**
A: Separates concerns, makes code testable, and ensures dependencies flow in one direction (toward abstractions).

**Q: Why so much TypeScript boilerplate?**
A: Type safety catches bugs at compile time. The strict configuration ensures maximum safety.

**Q: Can I use this in production?**
A: Yes, but customize it for your organization's security policies first.

## Next Steps

1. ✅ Read [01_project_overview.md](./01_project_overview.md)
2. ✅ Set up development environment (see [02_development_commands.md](./02_development_commands.md))
3. ✅ Run tests: `bun test`
4. ✅ Explore source code starting with `src/index.ts`
5. ✅ Read architecture docs when ready to contribute

## Task Completion Checklist

Before committing any changes:

- [ ] Tests pass: `bun test`
- [ ] Lint passes: `bun run lint`
- [ ] Types pass: `bun run typecheck`
- [ ] Format passes: `bun run check`
- [ ] Code follows functional style (no classes)
- [ ] Errors use `Result<T, E>` (no exceptions)
- [ ] Dependencies flow inward
- [ ] Magic literals extracted to constants
- [ ] JSDoc comments in English
- [ ] Tests written for new features

## Contact & Contribution

This is a template project. Fork it and customize for your needs.

For questions about the template or architectural decisions, refer to the detailed documentation in this directory.

---

**Welcome to the project! Start with [01_project_overview.md](./01_project_overview.md) →**
