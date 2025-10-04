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
4. **Calls** the local `osv-scanner` CLI to detect known advisories
5. **Maps** OSV severity data to Bun advisory levels and returns the results

### Advisory Levels

- **Fatal** (`level: 'fatal'`): Installation stops immediately
  - Examples: malware, token stealers, backdoors, critical vulnerabilities
- **Warning** (`level: 'warn'`): User prompted for confirmation
  - In TTY: User can choose to continue or cancel
  - Non-TTY: Installation automatically cancelled
  - Examples: protestware, adware, deprecated packages

All advisories are always displayed to the user regardless of level.

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
