# Bun OSV Scanner Examples

This directory contains minimal consumer projects for exercising the scanner in a real Bun workspace. Each example assumes you are iterating locally with `bun link` so that changes to this repository can be verified end-to-end without publishing to npm.

## Getting Started

1. From the repository root, register the scanner as a linked package:
   ```bash
   bun link
   ```
2. Open a new shell in the desired example directory and link the provider:
   ```bash
   bun link @pho9ubenaa/bun-osv-scanner
   ```
3. Run `bun install` in the example directory; Bun reads `bunfig.toml` and invokes the linked scanner automatically.

## Available Examples

### `rest-linked-consumer`

Demonstrates REST mode. The manifests declare `event-stream@3.3.6` (historical incident) and `lodash@4.17.21`. When you run `bun install`, the scanner contacts OSV via the REST adapter and raises a fatal advisory before packages are written to disk.

### `cli-linked-consumer`

Demonstrates CLI mode. Requires the `osv-scanner` binary on your `PATH`. `bun install` feeds the same manifest through the CLI adapter; expect a fatal advisory for `event-stream@3.3.6` or a descriptive process error if the binary is unavailable.
