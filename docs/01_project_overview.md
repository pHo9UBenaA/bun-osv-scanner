# Project Overview

## What is bun-osv-scanner?

`bun-osv-scanner` is a **security scanner plugin for Bun's package installation process** that detects vulnerabilities in npm packages by querying the [OSV (Open Source Vulnerability)](https://osv.dev) database. It integrates directly into Bun's package manager to provide real-time security scanning during `bun install`.

## Purpose

This project serves as a template and implementation for creating security scanners that:

1. **Intercept package installation** - Hook into Bun's package installation lifecycle
2. **Scan for known vulnerabilities** - Query the OSV database for security advisories
3. **Enforce security policies** - Block or warn about vulnerable packages before installation
4. **Provide actionable feedback** - Display clear security information to developers

## How It Works

The security scanner follows this workflow during `bun install`:

```
┌─────────────────┐
│ bun install     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 1. Bun reads bun.lock           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 2. Scanner parses bun.lock      │
│    → Extract dependency coords  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 3. Generate CycloneDX SBOM      │
│    (Software Bill of Materials) │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 4. Call OSV REST API (default)  │
│    → Query OSV.dev database     │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 5. Translate OSV results        │
│    → Map severities to levels   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 6. Return advisories to Bun     │
│    • fatal: block installation  │
│    • warn: prompt user          │
└─────────────────────────────────┘
```

### Advisory Levels

The scanner returns two types of advisories to Bun:

- **`fatal`** - Installation stops immediately
  - High/Critical severity vulnerabilities (CVSS ≥ 7.0)
  - Malware, token stealers, backdoors
  - Example: The infamous `event-stream` v3.3.6 incident

- **`warn`** - User prompted for confirmation (in TTY mode)
  - Moderate/Low severity vulnerabilities (4.0 ≤ CVSS < 7.0)
  - Deprecated packages, adware
  - Non-TTY: Installation automatically cancelled

## Technology Stack

### Core Runtime
- **Bun** - JavaScript runtime and package manager
  - Native Security Scanner API integration
  - Built-in test runner (`bun:test`)
  - Fast package management

### Language & Typing
- **TypeScript 5.9+** - All code is written in TypeScript
  - Strict mode enabled
  - ESNext target
  - Bundler module resolution

### External Data Sources
- **OSV REST API** - Primary source of vulnerability intelligence
  - Queried via `POST /v1/querybatch` and `GET /v1/vulns/{id}`
  - Supports pagination and incremental hydration of findings
- **`osv-scanner` CLI** (optional) - Google's official scanner used as a fallback mode
  - Install separately: `brew install osv-scanner`
  - Invoked via `Bun.spawn()` when CLI mode is selected

### Code Quality Tools
- **Oxlint** - Fast ESLint-compatible linter (written in Rust)
- **Biome** - Fast formatter (alternative to Prettier)
- **tsgo** - TypeScript type checker (native preview)
- **tsc** - Official TypeScript compiler (type checking only)

### Standards & Formats
- **CycloneDX 1.4** - SBOM (Software Bill of Materials) format
- **OSV Schema** - Vulnerability data interchange format
- **Package URL (PURL)** - Universal package identifier format

## Key Architectural Decisions

### 1. Functional Programming Approach
All code is written in a functional style:
- No classes, only pure functions
- Algebraic Data Types (ADTs) for domain modeling
- Explicit `Result<T, E>` types for error handling (no exceptions)

### 2. Layered Architecture (Clean Architecture)
Dependencies flow **inward** towards abstractions:

```
foundation (pure utilities)
    ↑
  core (business logic)
    ↑
  ports (interfaces)
    ↑
   app (orchestration)
    ↑
adapters (side effects)
    ↑
  boot (composition)
```

**Key rules:**
- `foundation` and `core` contain only pure functions
- `adapters` contain all side effects (HTTP fetch, process execution)
- `ports` define abstract interfaces (dependency inversion)
- `boot` wires everything together

### 3. Dependency Injection via Functions
Instead of classes or DI containers, we use **capability records**:

```typescript
type SecurityServiceDependencies = {
  readonly parseLock: (lock: unknown) => Result<...>;
  readonly generateSbom: (coords: ...) => SbomDocument;
  readonly osvScanner: OsvScannerPort;
};
```

This enables:
- Easy testing with stub implementations
- Clear dependency boundaries
- No hidden global state

### 4. Schema-Lite Validation
The scanner trusts inputs at strategic boundaries:
- `bun.lock` parsing filters malformed entries silently
- SBOM generation only emits fields consumed by the scanners
- OSV JSON parsing relies on fixture-driven validation covering REST payloads

This avoids heavy schema libraries while maintaining safety.

## Migration to Rails Context

This project is intended to be migrated to Ruby on Rails. Key considerations:

### Concepts to Port
1. **Layered architecture** → Rails service objects with clear boundaries
2. **Result types** → Ruby's `Result` or `Either` pattern (use `dry-monads` gem)
3. **Port/Adapter pattern** → Rails adapters for external services
4. **Functional composition** → Ruby's functional programming capabilities

### Components to Replicate
1. **SBOM generation** → Ruby gem for CycloneDX generation
2. **OSV integration** → HTTP API calls using the REST adapter
3. **Severity classification** → Business logic ported to Ruby
4. **Dependency parsing** → Parse `Gemfile.lock` instead of `bun.lock`

### Differences to Consider
- Template defaults to OSV REST API but also includes a CLI adapter for parity
- Node.js ecosystem → Ruby ecosystem (npm → RubyGems)
- TypeScript types → Ruby type checking (Sorbet/RBS)
- Bun's native integration → Custom Rails middleware or Bundler plugin

## Project Status

This is a **template project** maintained as a reference implementation for:
- Bun security scanner development
- Functional architecture patterns in TypeScript
- Integration with OSV vulnerability database

The project is production-ready but designed to be customized for specific organizational security policies.

## Next Steps

1. Read [02_development_commands.md](./02_development_commands.md) for daily development workflow
2. Read [03_code_style_and_conventions.md](./03_code_style_and_conventions.md) for coding standards
3. Read [04_architecture_deep_dive.md](./04_architecture_deep_dive.md) for detailed architectural patterns
4. Read [05_testing_strategy.md](./05_testing_strategy.md) for testing approach
5. Explore [osv-api/](./osv-api/) for OSV API documentation
