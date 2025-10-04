# Pre-Install Package Timing Validation

Goal: Empirically confirm that Bun invokes `scanner.scan({ packages })` before any dependency fetch/extraction or lifecycle script execution (e.g. `postinstall`).

## Rationale
The security model depends on receiving the full intended dependency coordinate list prior to executing potentially malicious scripts. A regression in Bun's timing would reintroduce a TOCTOU window.

## Method
1. Create a throwaway package that declares a `postinstall` script writing a marker file (e.g. `.postinstall-ran`).
2. Add it as a dependency to a temporary consumer project.
3. Inject an instrumentation wrapper security provider that:
   - Records a high-resolution timestamp at `scan()` entry.
   - Checks for existence of the marker file.
   - Logs a JSON line: `{ phase: "timing-check", markerExists: boolean, ts }`.
4. Run `bun install --security-provider ./instrumented.ts`.
5. Confirm that during the first invocation `markerExists` is `false`.

## Instrumentation Snippet
```ts
// instrumented.ts
import { scanner as baseScanner } from "@pho9ubenaa/bun-osv-scanner"; // or relative path

export const scanner: Bun.Security.Scanner = {
  ...baseScanner,
  async scan(ctx) {
    const marker = Bun.file(".postinstall-ran");
    const markerExists = await marker.exists();
    console.log(JSON.stringify({ phase: "timing-check", markerExists, ts: Date.now() }));
    return baseScanner.scan(ctx);
  },
};
```

## Sample Test Package
`package.json` for dependency under test:
```json
{
  "name": "timing-postinstall-probe",
  "version": "0.0.1",
  "scripts": { "postinstall": "echo ran > .postinstall-ran" }
}
```
Publish locally or use a workspace/relative path if supported.

## Expected Outcome
- First run: JSON log reports `markerExists: false`.
- After install finishes (or is blocked), the marker file may exist (if install proceeded and script ran). The crucial guarantee is absence at scan time.

## Recording
Append to the assumptions section in `src/boot/scanner.ts` once validated:
```
Assumption validated YYYY-MM-DD via PREINSTALL_TIMING.md procedure (marker absent at scan time).
```

## Failure Handling
If `markerExists` is `true` during scan:
1. STOP rollout.
2. Open an issue: "Pre-install timing regression: packages list delivered post-extraction".
3. Consider re-enabling legacy fallback while designing alternative mitigation.

## Future Automation
A future enhancement could convert this into a controlled integration test using a sandboxed FS and a stubbed Bun hook once Bun exposes a pre-lifecycle API surface for testing.
