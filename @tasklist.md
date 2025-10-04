# OSV REST API Integration Checklist

## Domain & Types
- [ ] Create `src/types/osvApi.ts` defining request and response types for `/v1/query`, `/v1/querybatch`, and `/v1/vulns/{id}`; ensure every field aligns with `docs/osv-api/*` and is documented with JSDoc.
- [ ] Add `src/core/osvApiTranslator.ts` exporting pure functions that convert REST responses into the existing `OsvScanResultsBody` and `OsvPackageFinding` structures, including handling for empty results and pagination tokens.
- [ ] Extend `src/types/osv.ts` only when additional severity metadata from the REST API must be exposed downstream; document any new constants or types.

## Foundation Utilities
- [ ] Implement `parseCycloneDxJson` (and supporting error ADTs) in `src/foundation/sbomJson.ts` to safely convert SBOM JSON strings into `DependencyCoordinates`.
- [ ] Implement `parseScannerCliArgs` in `src/foundation/cliArgs.ts`; accept `ReadonlyArray<string>` (e.g., `Bun.argv.slice(2)`) and return a validated configuration record that captures scanner mode, REST options, and CLI overrides.

## Ports & Core Contracts
- [ ] Update `src/ports/osvScannerPort.ts` so `OsvScannerError` covers REST failure variants (`network-error`, `invalid-status`, `invalid-json`) while retaining existing CLI error variants, and keep a single `scan` capability signature.
- [ ] Introduce `src/ports/scannerConfigPort.ts` defining the `ScannerRuntimeConfig` type produced by the CLI args parser, with documented fields for `mode`, `api`, and `cli` settings.

## Adapters
- [ ] Add `src/adapters/osvScannerApi.ts` exporting `createOsvScannerApiAdapter(deps)` where `deps` supplies `fetch`, `baseUrl`, `batchSize`, and an optional logger. The adapter must:
  - [ ] Use `parseCycloneDxJson` to obtain dependency coordinates from the SBOM JSON input.
  - [ ] Call `/v1/querybatch` until all `next_page_token` values are resolved, then hydrate vulnerabilities via `/v1/vulns/{id}` to assemble full findings.
  - [ ] Translate responses with the `osvApiTranslator` functions and surface failures through the expanded `OsvScannerError` variants.
- [ ] Update `src/adapters/osvScannerCli.ts` to accept configuration from `ScannerRuntimeConfig` (command overrides, working directory, temp-file options) without changing its outward `OsvScannerPort` API.

## App & Boot Wiring
- [ ] Add `src/app/configureScanner.ts` that accepts a `ScannerRuntimeConfig`, constructs the required adapters, and returns the selected `OsvScannerPort`, defaulting to the REST adapter.
- [ ] Update `src/boot/scanner.ts` to:
  - [ ] Parse CLI arguments via `parseScannerCliArgs`.
  - [ ] Build the runtime config and pass it to `configureScanner`.
  - [ ] Inject the resulting port into `createSecurityService`.
  - [ ] Keep existing error handling and ensure REST mode is the default when no arguments are provided.

## Testing
- [ ] Add `src/foundation/sbomJson.test.ts` covering successful parsing and error cases for the SBOM utility.
- [ ] Add `src/foundation/cliArgs.test.ts` covering default REST mode, explicit CLI mode, and invalid argument failures.
- [ ] Add `src/core/osvApiTranslator.test.ts` validating translation for empty results, warning-level findings, and fatal-level findings.
- [ ] Add `src/adapters/osvScannerApi.test.ts` using a stubbed `fetch` to cover success, pagination, HTTP failure, and malformed JSON responses.
- [ ] Extend `src/boot/scanner.test.ts` to assert default REST wiring and explicit CLI override behavior.

## Fixtures & Tooling
- [ ] Create fixtures under `fixtures/osv-api/` (e.g., `querybatch-success.json`, `querybatch-paginated.json`, `vuln-details.json`) for adapter and translator tests.
- [ ] Reuse existing SBOM fixtures (e.g., `fixtures/sbom/sample-sbom.cdx.json`) to avoid redundant test data.

## Documentation & Developer Experience
- [ ] Document the new CLI flags and configuration examples in `README.md` and expand `docs/02_development_commands.md` with usage instructions.
- [ ] Add JSDoc module headers and function comments to every new file introduced for the REST mode, following project conventions.

## Validation
- [ ] Confirm `bun test`, `bun run lint`, `bun run typecheck`, and `bun run check` succeed after implementing the REST mode.
