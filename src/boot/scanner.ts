/**
 * @file Bootstraps the Bun security scanner with real adapters.
 *
 * @section Overview
 * Wires concrete adapters (OSV REST/CLI) with the pure security service and exposes
 * a Bun `Security.Scanner` implementation. The scanner enforces a strict
 * pre-install verification: it receives the resolved package list from Bun
 * (name + version) and blocks the install on fatal advisories before any
 * package extraction or lifecycle script execution.
 *
 * @section Assumptions
 * 1. Pre-Install Package List Timing: Bun supplies `packages` to `scan()` BEFORE
 *    any package tarball is fetched, extracted, or postinstall script executed.
 *    - Validation Procedure: see `docs/PREINSTALL_TIMING.md`.
 *      Once executed, append a dated confirmation line here, e.g.:
 *      "Assumption validated 2025-10-05 via PREINSTALL_TIMING procedure (marker absent at scan time)."
 *      Assumption validated 2025-10-04 via PREINSTALL_TIMING manual procedure (marker file absent at scan invocation in local probe run).
 * 2. Ecosystem Scope: Currently only npm packages are supported; all derived
 *    coordinates use the `npm` ecosystem constant. Multi-ecosystem support will
 *    require introducing an adapter layer and is OUT OF SCOPE for this milestone.
 * 3. Legacy Filesystem Resolver: The recursive `node_modules` traversal is
 *    deprecated and retained ONLY behind the env flag `BUN_OSV_ENABLE_FS_FALLBACK`
 *    as an emergency rollback path. Planned removal target: v1.1.0.
 *    Ref: #LEGACY-REMOVAL (placeholder issue id).
 * 4. Policy Application Order: (a) base advisories -> (b) stale lock warn append
 *    -> (c) escalation (block-min-level) -> (d) unsafe downgrade. Documented in README.
 *
 * @section Defensive Notes
 * - If conversion of provided packages yields zero coordinates while the input
 *   list was non-empty, a fatal advisory is emitted (internal invariant guard).
 * - All debug logging is best-effort and must never throw.
 */

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { configureScanner } from "../app/configureScanner";
import {
  createSecurityService,
  type SecurityService,
  type SecurityServiceError,
} from "../app/securityService";
import { generateCycloneDxSbom } from "../core/sbomGenerator";
import {
  ADVISORY_LEVEL_FATAL,
  classifyPackageSeverity,
} from "../core/severity";
import { parseBunLock } from "../foundation/bunLockParser";
import {
  DEFAULT_OSV_API_BASE_URL,
  DEFAULT_OSV_API_BATCH_SIZE,
  parseScannerCliArgs,
  type ParseScannerCliArgsError,
} from "../foundation/cliArgs";
import { parseLenientJson } from "../foundation/lenientJson";
import { packagesToCoordinates } from "../foundation/packagesToCoordinates";
import type {
  DependencyResolver,
  ResolveDependenciesError,
} from "../ports/dependencyResolverPort";
import type { OsvScannerError, OsvScannerPort } from "../ports/osvScannerPort";
import {
  SCANNER_MODE_REST,
  type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";
import {
  DEPENDENCY_ECOSYSTEM_NPM,
  type DependencyCoordinate,
} from "../types/dependency";
import { err, ok, type Result } from "../types/result";

/**
 * Error emitted when the lockfile cannot be read.
 */
export type LockReadError =
  | {
      readonly type: "lock-read-error";
      readonly message: string;
    }
  | { readonly type: "lock-not-found" };

/**
 * Represents the result of attempting to load the Bun lockfile contents.
 */
export type LockReadResult = Result<unknown, LockReadError>;

/**
 * Capability for reading the Bun lockfile.
 */
export type LockReader = () => Promise<LockReadResult>;

/**
 * Default implementation of the lock reader that loads `bun.lock` from disk.
 */
const defaultReadLock: LockReader = async () => {
  const file = Bun.file("bun.lock");
  if (!(await file.exists())) {
    return err({ type: "lock-not-found" });
  }

  try {
    const text = await file.text();
    const parsed = parseLenientJson(text);
    if (!parsed.ok) {
      return err({
        type: "lock-read-error",
        message: parsed.error,
      });
    }
    return ok(parsed.data);
  } catch (cause) {
    return err({
      type: "lock-read-error",
      message: (cause as Error).message,
    });
  }
};

/**
 * Default resolver placeholder that reports missing configuration.
 */
const NODE_MODULES_DIRECTORY = "node_modules" as const;
const PACKAGE_MANIFEST_FILENAME = "package.json" as const;

/**
 * Legacy filesystem traversal dependency resolver.
 * DEPRECATED: Scheduled for removal in v1.1.0.
 * Guarded by env flag BUN_OSV_ENABLE_FS_FALLBACK for temporary rollback.
 * TODO(#LEGACY-REMOVAL): Remove this implementation and associated env flag after
 * one minor release cycle once pre-install path stability is confirmed.
 */
const legacyFilesystemResolveDependencies: DependencyResolver = async ({
  packages,
}) => {
  void packages; // packages ignored in legacy mode
  const root = NODE_MODULES_DIRECTORY;
  const pending: string[] = [root];
  const visited = new Set<string>();
  const seen = new Set<string>();
  const coordinates: DependencyCoordinate[] = [];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory || visited.has(directory)) continue;
    visited.add(directory);

    let entries: Array<Dirent>;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (cause) {
      if (directory === root) {
        return err({
          type: "manifest-read-error",
          message: describeDirectoryReadError(directory, cause),
        });
      }
      continue;
    }

    const manifestResult = await readCoordinateFromDirectory(directory);
    if (!manifestResult.ok) {
      return err({
        type: "dependency-resolution-error",
        message: manifestResult.error,
      });
    }

    const coordinate = manifestResult.data;
    if (coordinate) {
      const key = `${coordinate.name}@${coordinate.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        coordinates.push(coordinate);
      }
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const nextDirectory = join(directory, entry.name.toString());
      if (!visited.has(nextDirectory)) pending.push(nextDirectory);
    }
  }

  if (coordinates.length === 0) {
    return err({
      type: "dependency-resolution-error",
      message: "No installed dependencies were found under node_modules",
    });
  }

  const ordered = [...coordinates].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name);
    if (nameComparison !== 0) return nameComparison;
    return left.version.localeCompare(right.version);
  });
  return ok(ordered);
};

/**
 * Options accepted when constructing the scanner.
 */
export type CreateScannerOptions = {
  readonly readLock?: LockReader;
  readonly securityService?: SecurityService;
  readonly osvScanner?: OsvScannerPort;
  readonly resolveDependencies?: DependencyResolver;
  readonly argv?: ReadonlyArray<string>;
  readonly parseArgs?: (
    argv: ReadonlyArray<string>
  ) => ReturnType<typeof parseScannerCliArgs>;
  readonly configure?: (config: ScannerRuntimeConfig) => OsvScannerPort;
};

/**
 * Produce a human-readable fatal advisory when orchestration fails.
 */
const buildFatalAdvisory = (message: string): Bun.Security.Advisory => ({
  level: ADVISORY_LEVEL_FATAL,
  package: "bun.lock",
  url: null,
  description: message,
});

/**
 * Produce a human-readable fatal advisory for manifest-related failures.
 */
const buildManifestFatalAdvisory = (
  message: string
): Bun.Security.Advisory => ({
  level: ADVISORY_LEVEL_FATAL,
  package: "package.json",
  url: null,
  description: message,
});

/**
 * Create a Bun security scanner instance.
 */
export const createScanner = (
  options: CreateScannerOptions = {}
): Bun.Security.Scanner => {
  const readLock = options.readLock ?? defaultReadLock;
  const parseArgs = options.parseArgs ?? parseScannerCliArgs;
  const argv = options.argv ?? [];
  const parsedConfig = parseArgs(argv);
  const runtimeConfig = parsedConfig.ok
    ? parsedConfig.data
    : createDefaultRuntimeConfig();
  const cliArgsError = parsedConfig.ok ? null : parsedConfig.error;

  const configure =
    options.configure ??
    ((config: ScannerRuntimeConfig) => configureScanner(config));

  const osvScanner = options.osvScanner ?? configure(runtimeConfig);
  // NOTE: new default path does NOT traverse node_modules. We rely solely on
  // the package list provided by Bun pre-install. The legacy traversal can be
  // re-enabled temporarily via env flag for rollback purposes.
  const resolveDependencies =
    options.resolveDependencies ?? legacyFilesystemResolveDependencies;
  const securityService =
    options.securityService ??
    createSecurityService({
      parseLock: parseBunLock,
      generateSbom: generateCycloneDxSbom,
      classifySeverity: classifyPackageSeverity,
      osvScanner,
    });

  return {
    version: "1",
    async scan({ packages }) {
      const debug = (data: Record<string, unknown>) => {
        if (process.env.BUN_OSV_DEBUG !== "1") return;
        try {
          // Minimal JSON line log with timestamp.
          console.log(
            JSON.stringify({ ts: Date.now(), ...data }, (_k, v) => v)
          );
        } catch {
          // Swallow to avoid impacting install flow.
        }
      };

      if (cliArgsError) {
        return [
          buildFatalAdvisory(
            `Invalid scanner arguments: ${describeCliArgsError(cliArgsError)}`
          ),
        ];
      }

      if (!packages || packages.length === 0) {
        return [];
      }

      const lockResult = await readLock();
      if (!lockResult.ok) {
        if (lockResult.error.type === "lock-not-found") {
          const useLegacy = process.env.BUN_OSV_ENABLE_FS_FALLBACK === "1";
          debug({
            phase: "pre-install-scan",
            packages: packages.length,
            lockPresent: false,
            legacyFallback: useLegacy,
            staleLockWarn: false,
          });
          if (useLegacy) {
            const resolved = await resolveDependencies({ packages });
            if (!resolved.ok) {
              return [
                buildManifestFatalAdvisory(
                  `Failed to resolve dependencies: ${describeResolveDependenciesError(
                    resolved.error
                  )}`
                ),
              ];
            }
            const advisoriesFromCoordinates =
              await securityService.scanCoordinates(resolved.data);
            if (!advisoriesFromCoordinates.ok) {
              return [
                buildManifestFatalAdvisory(
                  describeServiceError(advisoriesFromCoordinates.error)
                ),
              ];
            }
            return advisoriesFromCoordinates.data;
          }

          // New path: convert packages directly without filesystem traversal.
          const conversion = packagesToCoordinates(packages);
          if (!conversion.ok) {
            return [
              buildManifestFatalAdvisory(
                `Invalid package metadata: ${conversion.error.message}`
              ),
            ];
          }
          const advisoriesFromCoordinates =
            await securityService.scanCoordinates(conversion.data);
          if (!advisoriesFromCoordinates.ok) {
            return [
              buildManifestFatalAdvisory(
                describeServiceError(advisoriesFromCoordinates.error)
              ),
            ];
          }
          if (packages.length > 0 && conversion.data.length === 0) {
            return [
              buildManifestFatalAdvisory(
                "Internal error: no coordinates derived from non-empty package list"
              ),
            ];
          }
          const final = applyPolicy(
            advisoriesFromCoordinates.data,
            runtimeConfig.policy
          );
          debug({
            phase: "pre-install-scan",
            packages: packages.length,
            lockPresent: false,
            legacyFallback: false,
            staleLockWarn: false,
            advisories: final.length,
          });
          return final;
        }
        return [
          buildFatalAdvisory(
            `Failed to read bun.lock: ${lockResult.error.message}`
          ),
        ];
      }

      // Decide whether to scan the lock or the provided (pre-install) package list.
      // Rationale: During an in-flight install, Bun supplies the packages about to
      // be installed BEFORE the lock is updated. To prevent TOCTOU gaps we must
      // prefer scanning the provided packages when they diverge from the existing
      // bun.lock contents. We still emit a (non-blocking) stale lock warning.
      let advisoriesResult: Result<
        ReadonlyArray<Bun.Security.Advisory>,
        SecurityServiceError
      >;
      let staleWarn: Bun.Security.Advisory | null = null;
      let usedPackagesInsteadOfLock = false;
      try {
        const parsedLock = parseBunLock(lockResult.data);
        if (parsedLock.ok) {
          const lockSet = new Set(
            parsedLock.data.map((c) => `${c.name}@${c.version}`)
          );
          const pkgSet = new Set(packages.map((p) => `${p.name}@${p.version}`));
          let mismatch = false;
          if (lockSet.size !== pkgSet.size) {
            mismatch = true;
          } else {
            for (const k of pkgSet) {
              if (!lockSet.has(k)) {
                mismatch = true;
                break;
              }
            }
          }
          if (mismatch) {
            // Convert provided packages to coordinates and scan them directly.
            const conversion = packagesToCoordinates(packages);
            if (!conversion.ok) {
              return [
                buildManifestFatalAdvisory(
                  `Invalid package metadata: ${conversion.error.message}`
                ),
              ];
            }
            usedPackagesInsteadOfLock = true;
            advisoriesResult = await securityService.scanCoordinates(
              conversion.data
            );
            if (process.env.BUN_OSV_ENABLE_STALE_LOCK_WARN === "1") {
              staleWarn = {
                level: "warn",
                package: "bun.lock",
                url: null,
                description:
                  "Lock contents differ from provided package list (potentially stale lock)",
              };
            }
          } else {
            // Perfect match: scan the lock as authoritative snapshot.
            advisoriesResult = await securityService.scan(lockResult.data);
          }
        } else {
          // If lock parse fails inside the service it will surface as an error; still attempt normal scan path.
          advisoriesResult = await securityService.scan(lockResult.data);
        }
      } catch {
        // Fallback: attempt scanning lock directly if comparison logic throws.
        advisoriesResult = await securityService.scan(lockResult.data);
      }

      if (!advisoriesResult.ok) {
        return [
          buildFatalAdvisory(describeServiceError(advisoriesResult.error)),
        ];
      }
      // Append stale lock warning only when:
      //  - env flag explicitly enabled, and
      //  - there is at least one vulnerability advisory (to avoid noisy singleton warn)
      const withStale =
        staleWarn && advisoriesResult.data.length > 0
          ? [...advisoriesResult.data, staleWarn]
          : advisoriesResult.data;
      const final = applyPolicy(withStale, runtimeConfig.policy);
      debug({
        phase: "pre-install-scan",
        packages: packages.length,
        lockPresent: true,
        legacyFallback: false,
        staleLockWarn: Boolean(staleWarn),
        scanSource: usedPackagesInsteadOfLock ? "packages" : "lock",
        advisories: final.length,
      });
      return final;
    },
  };
};

/**
 * Convert service-level errors into human-readable descriptions.
 */
const describeServiceError = (error: SecurityServiceError): string => {
  switch (error.type) {
    case "lock-parse-error":
      return `Failed to parse bun.lock: ${error.error}`;
    case "sbom-serialization-error":
      return `Failed to serialize SBOM: ${error.message}`;
    case "osv-scan-error":
      return `OSV scanner failed: ${describeOsvScannerError(error.error)}`;
  }
};

/**
 * Convert dependency resolution errors into readable descriptions.
 */
const describeResolveDependenciesError = (
  error: ResolveDependenciesError
): string => {
  switch (error.type) {
    case "manifest-read-error":
      return error.message;
    case "dependency-resolution-error":
      return error.message;
  }
};

/**
 * Describe filesystem access errors encountered while reading dependency directories.
 */
const describeDirectoryReadError = (
  directory: string,
  cause: unknown
): string => {
  const error = cause as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") {
    return `${directory} not found. Run \`bun install\` to install dependencies.`;
  }
  return error?.message ?? `Failed to read ${directory}`;
};

/**
 * Read a dependency coordinate from the package manifest located in the directory.
 */
const readCoordinateFromDirectory = async (
  directory: string
): Promise<Result<DependencyCoordinate | null, string>> => {
  const manifestPath = join(directory, PACKAGE_MANIFEST_FILENAME);
  let contents: string;

  try {
    contents = await readFile(manifestPath, "utf8");
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException | undefined;
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      return ok(null);
    }
    return err(
      `Failed to read ${manifestPath}: ${error?.message ?? "unknown error"}`
    );
  }

  const parsed = parseLenientJson(contents);
  if (!parsed.ok) {
    return err(`Failed to parse ${manifestPath}: ${parsed.error}`);
  }

  if (!isRecord(parsed.data)) {
    return err(`Invalid manifest structure at ${manifestPath}`);
  }

  const name = parsed.data.name;
  const version = parsed.data.version;
  if (typeof name !== "string" || name.length === 0) {
    return err(`Missing package name in ${manifestPath}`);
  }
  if (typeof version !== "string" || version.length === 0) {
    return err(`Missing package version in ${manifestPath}`);
  }

  return ok({
    ecosystem: DEPENDENCY_ECOSYSTEM_NPM,
    name,
    version,
  });
};

/**
 * Determine whether the provided value is a plain object record.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

/**
 * Provide a human-readable message for OSV scanner adapter failures.
 */
const describeOsvScannerError = (error: OsvScannerError): string => {
  switch (error.type) {
    case "process-failed":
    case "decode-error":
    case "network-error":
    case "invalid-json":
      return error.message;
    case "invalid-status":
      return error.body
        ? `HTTP ${error.status}: ${error.body}`
        : `HTTP ${error.status}`;
  }
};

/**
 * Build the default scanner runtime configuration.
 */
const createDefaultRuntimeConfig = (): ScannerRuntimeConfig => ({
  mode: SCANNER_MODE_REST,
  api: {
    baseUrl: DEFAULT_OSV_API_BASE_URL,
    batchSize: DEFAULT_OSV_API_BATCH_SIZE,
  },
  cli: {
    command: null,
    workingDirectory: null,
    tempFileDirectory: null,
  },
});

/**
 * Convert CLI argument parse errors into human-readable descriptions.
 */
const describeCliArgsError = (error: ParseScannerCliArgsError): string => {
  switch (error.type) {
    case "unknown-option":
      return `unknown option ${error.option}`;
    case "missing-value":
      return `missing value for ${error.option}`;
    case "invalid-mode":
      return `invalid mode '${error.value}'`;
    case "invalid-batch-size":
      return `invalid batch size '${error.value}'`;
  }
};

/**
 * Default scanner instance used by Bun.
 */
export const scanner = createScanner();
// (Removed duplicate imports appended by generator mistake)

/**
 * Apply policy transformations to advisory levels.
 * - If blockMinLevel === 'warn': escalate all warn -> fatal (to block on any issue)
 * - If allowUnsafe: downgrade fatal -> warn after escalation
 */
const applyPolicy = (
  advisories: ReadonlyArray<Bun.Security.Advisory>,
  policy: { blockMinLevel: "fatal" | "warn"; allowUnsafe: boolean } | undefined
): ReadonlyArray<Bun.Security.Advisory> => {
  if (!policy) return advisories;
  let transformed = advisories;
  if (policy.blockMinLevel === "warn") {
    transformed = transformed.map((a) =>
      a.level === "warn"
        ? { ...a, level: "fatal" as const, description: a.description }
        : a
    );
  }
  if (policy.allowUnsafe) {
    transformed = transformed.map((a) =>
      a.level === "fatal"
        ? { ...a, level: "warn" as const, description: a.description }
        : a
    );
  }
  return transformed;
};
