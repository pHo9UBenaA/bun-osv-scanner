# OSV Scanner JSON Contract

This document captures the JSON payload that `osv-scanner` v2.2.2 emits when we
scan a CycloneDX 1.4 SBOM. We will use this contract to drive our parser and
advisory-mapping tests.

## Command

```bash
osv-scanner scan source --format json -L fixtures/sbom/sample-sbom.cdx.json
```

The SBOM (`fixtures/sbom/sample-sbom.cdx.json`) contains a single npm component:

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

## Observed Response Skeleton

The complete sample is stored at `fixtures/osv/event-stream-osv.json`. The
fields we will rely on are:

- `results[]`: top-level array, one entry per scanned input artifact.
  - `source.path`: absolute path to the scanned SBOM (string).
  - `packages[]`: one entry per identified package.
    - `package.name`: package name (string).
    - `package.version`: package version (string).
    - `package.ecosystem`: ecosystem identifier (string, e.g. `npm`).
    - `vulnerabilities[]`: zero or more vulnerability records.
      - `id`: advisory identifier (e.g. `GHSA-mh6f-8j2x-4483`).
      - `summary`: human readable summary of the advisory.
      - `details`: long description string (may contain newlines).
      - `severity[]`: list of scoring entries.
        - `type`: scoring system (e.g. `CVSS_V3`).
        - `score`: score vector string (`CVSS:3.1/...`).
      - `affected[]`: package/range metadata.
        - `package.purl`: Package URL string (`pkg:npm/...`).
        - `ranges[]`: semver event list with `introduced`/`fixed` pairs.
      - `references[]`: URLs with categories (`ADVISORY`, `WEB`, ...).
      - `database_specific.severity`: textual severity (`CRITICAL`, `HIGH`, ...).
    - `groups[]`: aggregated vulnerability groups.
      - `max_severity`: numeric string (CVSS base score as text).

We can safely ignore `experimental_config` for our purposes.

## Next Steps

1. Build parsers that extract the minimalist dataset our core logic needs:
   package coordinates, vulnerability ID/summary/details, severity signals, and
   affected ranges.
2. Add tests that validate the parsing against
   `fixtures/osv/event-stream-osv.json` to lock the contract.
