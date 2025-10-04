# Development Commands

This document describes all commands you need for daily development work.

## System Requirements

- **OS**: macOS (Apple Silicon M4 recommended)
- **Runtime**: Bun 1.x+ (JavaScript runtime and package manager)
- **External Tool**: osv-scanner (Google's vulnerability scanner CLI)

### Installation

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install osv-scanner
brew install osv-scanner

# Install project dependencies
bun install
```

## Daily Development Workflow

### 1. Testing

Run all tests using Bun's built-in test runner:

```bash
bun test
```

**What it does:**
- Executes all `*.test.ts` files
- Uses `bun:test` API (describe, test, expect)
- Tests run across all layers: foundation → core → ports → adapters → app → boot
- Fast execution (native performance)

**Test file locations:**
```
src/foundation/bunLockParser.test.ts
src/core/sbomGenerator.test.ts
src/core/severity.test.ts
src/adapters/osvScannerCli.test.ts
src/app/securityService.test.ts
src/boot/scanner.test.ts
```

**Example output:**
```
✓ foundation/bunLockParser > parses dependency coordinates
✓ core/severity > classifies critical as fatal
✓ app/securityService > returns advisories
```

### 2. Linting

#### Check for Issues

```bash
bun run lint
```

**What it does:**
- Runs `oxlint` with TypeScript configuration
- Fast Rust-based linter (ESLint-compatible)
- Checks for common mistakes and code smells

#### Auto-fix Issues

```bash
bun run lint:fix
```

**What it does:**
- Automatically fixes auto-fixable linting issues
- Modifies files in place
- Reports remaining issues that need manual fix

### 3. Type Checking

#### Fast Type Check (Recommended)

```bash
bun run typecheck
```

**What it does:**
- Runs `tsgo` (TypeScript native preview)
- Faster than official `tsc`
- Full type checking with strict mode

#### Official TypeScript Compiler

```bash
bun run typecheck:tsc
```

**What it does:**
- Runs official TypeScript compiler in `--noEmit` mode
- Slower but guaranteed compatibility
- Use when `tsgo` results seem incorrect

### 4. Formatting

#### Format All Files

```bash
bun run format
```

**What it does:**
- Runs Biome formatter on all TypeScript/JSON files
- Tab indentation (configured in `biome.json`)
- Modifies files in place
- Fast alternative to Prettier

#### Check Code Quality

```bash
bun run check
```

**What it does:**
- Runs Biome's comprehensive check
- Combines formatting and linting checks
- Shows issues without modifying files

## Task Completion Checklist

**Before considering a task complete, run all of these:**

```bash
bun test              # All tests must pass
bun run lint          # No linting errors
bun run typecheck     # No type errors
bun run check         # Code style compliant
```

**Quick command to run all checks:**

```bash
bun test && bun run lint && bun run typecheck && bun run check
```

## Running the Scanner Locally

### Option 1: Test in Another Bun Project

```bash
# In this project
bun link

# In target project
bun link @pho9ubenaa/bun-osv-scanner
```

Then add to `bunfig.toml` in target project:

```toml
[install.security]
scanner = "@pho9ubenaa/bun-osv-scanner"
```

### Option 2: Manual Testing

The scanner is automatically invoked by Bun during package installation when configured. You cannot run it standalone.

## Debugging

### Inspecting Test Failures

```bash
# Run specific test file
bun test src/core/severity.test.ts

# Run with verbose output
bun test --verbose
```

### Inspecting SBOM Generation

Check the fixture to see example SBOM output:

```bash
cat fixtures/sbom/sample-sbom.cdx.json
```

### Inspecting OSV Results

Check the fixture to see example OSV scanner output:

```bash
cat fixtures/osv/event-stream-osv.json
```

### Testing OSV Scanner CLI Directly

```bash
# Create a test SBOM
cat > /tmp/test-sbom.json << 'EOF'
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
EOF

# Run osv-scanner
osv-scanner scan source --format json -L /tmp/test-sbom.json
```

## Git Workflow

### Common Commands

```bash
# Stage changes
git add src/

# Commit with message
git commit -m "feat: add severity classification"

# Push changes
git push origin main
```

### Checking Changes

```bash
# See unstaged changes
git diff

# See staged changes
git diff --cached

# See changed files
git status
```

## Common Unix Utilities (macOS)

### File Operations

```bash
# List files
ls -la

# Find files by name
find src -name "*.ts"

# Search in files (grep)
grep -r "classifyPackageSeverity" src/
```

### Directory Navigation

```bash
# Change directory
cd src/core/

# Return to project root
cd /Users/ryohei.hashimoto/Documents/git/job/202509_aeonmarketing/web-app/bun-osv-scanner

# Print working directory
pwd
```

### File Inspection

```bash
# View file contents
cat src/index.ts

# View with pagination
less src/types/osv.ts

# View first/last lines
head -20 src/boot/scanner.ts
tail -20 src/boot/scanner.ts
```

## Troubleshooting

### Tests Failing

1. Check if dependencies are installed: `bun install`
2. Check if `osv-scanner` is available: `which osv-scanner`
3. Check TypeScript errors: `bun run typecheck`

### osv-scanner Not Found

```bash
# macOS
brew install osv-scanner

# Verify installation
osv-scanner --version
```

### Type Errors

```bash
# Clear Bun cache
rm -rf node_modules
bun install

# Re-run type check
bun run typecheck
```

### Permission Errors

```bash
# Make sure you have write permissions
chmod +w src/

# Check file ownership
ls -la src/
```

## Performance Tips

- **Use `bun test` instead of `jest`** - Much faster
- **Use `oxlint` instead of `eslint`** - Orders of magnitude faster
- **Use `tsgo` instead of `tsc`** - Faster type checking
- **Use `biome` instead of `prettier + eslint`** - Single fast tool

## CI/CD Integration

While not currently configured, here's a typical CI pipeline:

```yaml
# Example GitHub Actions workflow
- run: bun install
- run: bun test
- run: bun run lint
- run: bun run typecheck
- run: bun run check
```

## Environment Variables

This project does not use environment variables. All configuration is hardcoded or passed as function parameters.

## Additional Resources

- [Bun Documentation](https://bun.sh/docs)
- [Bun Security Scanner API](https://bun.com/docs/install/security-scanner-api)
- [OSV.dev](https://osv.dev)
- [CycloneDX Specification](https://cyclonedx.org/specification/overview/)
