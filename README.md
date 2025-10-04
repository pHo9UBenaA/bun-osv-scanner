<img src="https://bun.com/logo.png" height="36" />

# Bun Security Scanner Template

A template for creating a security scanner for Bun's package installation
process. Security scanners scan packages against your threat intelligence feeds
and control whether installations proceed based on detected threats.

📚 [**Full documentation**](https://bun.com/docs/install/security-scanner-api)

## How It Works

When packages are installed via Bun, your security scanner:

1. **Receives** package information (name, version)
2. **Translates** the local `bun.lock` into dependency coordinates
3. **Generates** a CycloneDX SBOM from those coordinates
4. **Scans** dependencies against OSV — defaulting to the REST API and falling
   back to the `osv-scanner` CLI when requested
5. **Maps** OSV severity data to Bun advisory levels and returns the results

### Advisory Levels

- **Fatal** (`level: 'fatal'`): Installation stops immediately
  - Examples: malware, token stealers, backdoors, critical vulnerabilities
- **Warning** (`level: 'warn'`): User prompted for confirmation
  - In TTY: User can choose to continue or cancel
  - Non-TTY: Installation automatically cancelled
  - Examples: protestware, adware, deprecated packages

All advisories are always displayed to the user regardless of level.

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
