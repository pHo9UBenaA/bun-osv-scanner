# cli-linked-consumer

A minimal Bun project designed for local development using `bun link` while testing the CLI mode of a scanner via `bunfig.toml`.

## Prerequisites

- `bun` version 1.0 or later
- Security providers linked to this repository:
  ```bash
  # Run from the root directory of this repository
  bun link
  ```

## Setup Instructions

Link the provider to the example workspace:
```bash
bun link @pho9ubenaa/bun-osv-scanner
```

## How to Perform Scanning

```bash
bun i
```

- The `bun install` command reads `bunfig.toml`, loads the linked scanner, and then automatically applies the `--mode cli --api-base-url https://api.osv.dev` option.
- The manifest file lists `event-stream@3.3.6` (which has a known vulnerability) and `lodash@0.9.2`. Since the scanner inspects the `package.json` / `bun.lock` files via OSV before writing the dependency tarball to disk, it immediately halts the installation process if a critical advisory is returned.

Verify the terminal output to confirm the advisory originates from the locally linked provider.

Example execution:
```bash
bun install v1.2.23 (cf136713)

  FATAL: lodash
    via @pho9ubenaa/bun-osv-scanner-example-cli › lodash
    Command injection vulnerability in lodash
    https://nvd.nist.gov/vuln/detail/CVE-2021-23337

1 advisory (1 critical)
Installation interrupted due to detected critical security advisory
⏳[@pho9ubenaa/bun-osv-scanner] Scanned 1 package in 1842ms
```
