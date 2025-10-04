# Scanner Workflow

This provider now shells out to the local `osv-scanner` CLI instead of relying
on a mock threat feed. The orchestration happens in distinct layers:

1. **Foundation** (`src/foundation/bunLockParser.ts`)
   - Parses the JSON structure emitted by `bun.lock` into dependency
     coordinates.
2. **Core** (`src/core/sbomGenerator.ts`, `src/core/severity.ts`)
   - Generates a minimal CycloneDX 1.4 SBOM from the dependency coordinates.
   - Maps OSV severities (labels/numeric scores) onto Bun advisory levels.
3. **Ports & Adapters** (`src/ports/osvScannerPort.ts`, `src/adapters/osvScannerCli.ts`)
   - Defines an abstract OSV scanning capability.
   - Implements the capability by calling the local `osv-scanner scan source`
     command with JSON output.
4. **Application** (`src/app/securityService.ts`)
   - Ties the parser, SBOM generator, severity classifier, and OSV port
     together, returning `Result<Bun.Security.Advisory[]>`.
5. **Boot** (`src/boot/scanner.ts`)
   - Reads `bun.lock`, builds the application service with the real adapter, and
     exposes the `scanner` consumed by Bun.

## Error Handling

- Failing to read or parse `bun.lock` produces a fatal advisory referencing the
  lockfile.
- Failures in SBOM serialization or the OSV CLI also surface as fatal advisories
  with diagnostic messages.

## Tests

- `src/app/securityService.test.ts` consumes
  `fixtures/osv/event-stream-osv.json` to lock the advisory mapping against real
  OSV output.
- `src/adapters/osvScannerCli.test.ts` exercises success and failure modes of the
  CLI adapter without shelling out.
- `src/boot/scanner.test.ts` verifies the boot logic, including fatal paths for lock read
  and OSV scan errors.

## Usage Notes

- Ensure the local environment has `osv-scanner` available on `PATH`.
- The CLI adapter writes a temporary CycloneDX file to the OS temp directory for
  each scan and removes it afterwards.
