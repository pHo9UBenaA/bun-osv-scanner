<img src="https://bun.com/logo.png" height="36" />

# Bun Security Scanner Template

A template for creating a security scanner for Bun's package installation
process. Security scanners scan packages against your threat intelligence feeds
and control whether installations proceed based on detected threats.

📚 [**Full documentation**](https://bun.com/docs/install/security-scanner-api)

## How It Works

When packages are installed via Bun, your security scanner now enforces a strict
"verify-before-install" model:

1. **Receives** the intended package list (name + version) from Bun *before any package is fetched or unpacked*
2. **Attempts** to load and parse `bun.lock` (if present) for authoritative resolution
3. **Falls back (secure path)** to the provided package list when `bun.lock` is absent — no filesystem traversal of `node_modules`
4. **Generates** a minimal CycloneDX SBOM representation (lock-based path only)
5. **Scans** dependency coordinates against OSV (REST by default, CLI when requested)
6. **Maps** OSV severity data to Bun advisory levels and returns the results — blocking the install on fatal advisories

### Removal of `node_modules` Traversal

Earlier iterations walked the `node_modules` directory when `bun.lock` was missing. That introduced a time-of-check/time-of-use risk because packages (and their install scripts) could already have executed.

This fallback has been **removed by default**. The scanner now derives coordinates exclusively from Bun's pre-install package list when no lockfile exists.

If you encounter an unexpected environment that still requires the legacy behavior, you may temporarily re-enable it (deprecated) by setting:

```bash
BUN_OSV_ENABLE_FS_FALLBACK=1 bun install
```

This flag will be removed in a future release and should only be used for short-lived rollbacks.

### Advisory Levels

- **Fatal** (`level: 'fatal'`): Installation stops immediately
  - Examples: malware, token stealers, backdoors, critical vulnerabilities
- **Warning** (`level: 'warn'`): User prompted for confirmation
  - In TTY: User can choose to continue or cancel
  - Non-TTY: Installation automatically cancelled
  - Examples: protestware, adware, deprecated packages

All advisories are always displayed to the user regardless of level.

### Planned Overrides & Policy Extensions

The following environment controls are planned (not all may be active yet):

- `BUN_OSV_SCANNER_ALLOW_UNSAFE=1` – Temporarily bypass blocking (downgrades fatal to warn). Use only in emergency situations.

Always prefer fixing or pinning vulnerable versions over using overrides.

## Runtime Modes

The scanner now supports two execution modes controlled through CLI flags:

| Mode | Description |
|------|-------------|
| `rest` *(default)* | Uses the public OSV REST API (`https://api.osv.dev`) with batched requests |
| `cli` | Invokes the local `osv-scanner` binary exactly as previous releases |

### CLI Flags

Pass flags to the scanner by appending them after the provider entry in
`bunfig.toml` or directly via `Bun.argv` during local runs:

```bash
bun install --security-provider ./dist/index.ts -- --mode rest --api-base-url https://api.osv.dev
```

Available flags:

- `--mode <rest|cli>` — selects the adapter implementation
- `--api-base-url <url>` — overrides the OSV API host (REST mode only)
- `--api-batch-size <number>` — changes the `/v1/querybatch` chunk size
- `--cli-command <arg>` — repeat to override the CLI command tokens
- `--cli-cwd <path>` — run the CLI in a custom working directory
- `--cli-temp-dir <path>` — write SBOM temp files into a custom directory

Invalid flags return a *fatal* advisory with a descriptive error message so the
failure is visible during installation.

## Policy & Flags

The scanner applies a deterministic transformation pipeline to raw advisories:

1. Base advisories collected (lock or direct package coordinates)
2. (Optional) Stale lock warning appended if `bun.lock` entries differ from the provided package list
3. Escalation: if minimum blocking level is set to `warn`, all warn advisories are escalated to fatal
4. Unsafe downgrade: if emergency override enabled, fatal advisories are downgraded back to warn

Environment variables / CLI options:

| Control | Purpose | Default | Effect |
|---------|---------|---------|--------|
| `--block-min-level <fatal|warn>` / `BUN_OSV_BLOCK_MIN_LEVEL=warn` | Tighten policy to block on any warn-level advisory | `fatal` | Escalates every `warn` advisory to `fatal` causing an install block |
| `BUN_OSV_SCANNER_ALLOW_UNSAFE=1` | Emergency bypass (last resort) | unset | Downgrades all fatal advisories to warn after escalation (still visible; may auto-cancel in non-TTY) |
| (internal) Stale lock detection | Detect drift between lockfile and resolved packages | n/a | Adds a `warn` advisory (`bun.lock`) describing mismatch; never escalated beyond policy rules |

Example: Block on all advisories (treat warn as fatal)
```bash
bun install --security-provider ./dist/index.ts -- --block-min-level warn
```

Example: Temporarily bypass blocking while collecting data (NOT recommended long-term)
```bash
BUN_OSV_SCANNER_ALLOW_UNSAFE=1 bun install --security-provider ./dist/index.ts
```

Example: Combine strict blocking with explicit REST settings
```bash
BUN_OSV_BLOCK_MIN_LEVEL=warn bun install --security-provider ./dist/index.ts -- --api-batch-size 50
```

Stale Lock Warning Semantics:
- Emitted when the sorted set of `name@version` pairs from `bun.lock` differs from Bun's provided `packages` list.
- Advisory level: `warn` (informational). Use it to prompt a lockfile refresh.
- Will escalate to `fatal` only if `--block-min-level warn` is active (policy stage 3).

Policy Order Recap:
```
collect -> append stale warn -> escalate (block-min-level) -> unsafe downgrade
```

This order ensures an operator can: (a) enforce strict blocking, (b) still receive drift visibility, and (c) override blocking only in emergency scenarios without losing advisory context.

### Error Handling

If your `scan` function throws an error, it will be gracefully handled by Bun, but the installation process **will be cancelled** as a defensive precaution.

### Validation

The scanner performs schema-lite validation by working with trusted inputs:

- `bun.lock` parsing filters out malformed package entries.
- CycloneDX SBOM generation only emits the fields consumed by `osv-scanner`.
- OSV JSON parsing is locked by fixtures under `fixtures/osv/`.

### Useful Bun APIs

- [**Security scanner API Reference**](https://bun.com/docs/install/security-scanner-api): API contract for Bun scanners
- [**`Bun.file`**](https://bun.com/docs/api/file-io): Used to load `bun.lock`
- [**`Bun.spawn`**](https://bun.com/docs/api/spawn): Powers the `osv-scanner` CLI adapter

## Testing

Run the full suite (foundation, core, ports, adapters, app, boot) with:

```bash
bun test
```

## Examples

Developing against Bun's security provider APIs often requires a live consumer. The `examples/` directory contains minimal projects wired for `bun link` so you can validate the REST and CLI scanner modes without publishing. Follow `examples/README.md` for step-by-step usage.

## Publishing Your Provider

Publish your security scanner to npm:

```bash
bun publish
```

Users can now install your provider and add it to their `bunfig.toml` configuration.

To test locally before publishing, use [`bun link`](https://bun.sh/docs/cli/link):

```bash
# In your provider directory
bun link

# In your test project
bun link @acme/bun # this is the name in package.json of your provider
```

## Contributing

This is a template repository. Fork it and customize for your organization's
security requirements.

## Support

For docs and questions, see the [Bun documentation](https://bun.com/docs/install/security-scanner-api) or [Join our Discord](https://bun.com/discord).

For template issues, please open an issue in this repository.
