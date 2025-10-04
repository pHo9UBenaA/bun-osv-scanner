# Manual Smoke Validation: Pre-Install Block

Purpose: Demonstrate that a fatal advisory blocks installation BEFORE any dependency artifacts are unpacked.

## Scenario
Block a benign package (`left-pad@999.0.0`) via a forced fatal advisory path when no `bun.lock` is present.

## Steps
1. Build / link the scanner
   ```bash
   bun run build # if build script exists, otherwise compile sources
   bun link
   ```
2. Create a temporary consumer project:
   ```bash
   mkdir -p /tmp/bun-smoke && cd /tmp/bun-smoke
   bun init -y
   # Add a dependency that won't actually exist at that version (simulating resolution intent)
   echo '{"name":"smoke","version":"1.0.0","dependencies":{"left-pad":"999.0.0"}}' > package.json
   ```
3. Configure security provider in a local `bunfig.toml`:
   ```toml
   [install]
   security = ["@pho9ubenaa/bun-osv-scanner"]
   ```
   If using the linked copy replace name with the local path:
   ```toml
   [install]
   security = ["../path/to/scanner/dist/index.ts"]
   ```
4. Force a fatal advisory. Option A (recommended): temporarily modify the stub service in tests OR create a tiny wrapper provider that always returns a fatal for `left-pad@999.0.0`. Option B: set `OSV` fixtures to include a critical vulnerability for that coordinate and run in offline mode (future enhancement).
5. Run:
   ```bash
   bun install
   ```
6. Observe output: should display a fatal advisory referencing `left-pad` and abort before creating any `node_modules/left-pad` directory.
7. Verify no extraction:
   ```bash
   test -d node_modules/left-pad && echo "UNEXPECTED: directory exists" || echo "OK: no extraction"
   ```
8. Revert temporary fatal override.

## Expected Output (Example Snippet)
```
1 fatal advisory:
- left-pad@999.0.0 Critical vulnerability (simulated)
Installation aborted.
```

## Recording
After successful verification, update `plan-detail.md` (Section 4.1) with:
```
Validated YYYY-MM-DD: left-pad@999.0.0 blocked pre-install; no node_modules/left-pad present.
```
Optionally capture a screenshot of terminal output for future audits.

### Validation Record
Validated 2025-10-04: `left-pad@999.0.0` block simulated (fatal advisory injected). Confirmed absence of `node_modules/left-pad` prior to advisory output.

## Notes
- This manual test complements the automated integration test located at `src/boot/integration.preinstall-block.test.ts`.
- If Bun changes timing semantics, this manual check will surface unexpected early extraction; in that case open an issue immediately.
