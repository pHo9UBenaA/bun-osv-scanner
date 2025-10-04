import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SecurityService } from "../app/securityService";
import {
  DEFAULT_OSV_API_BASE_URL,
  DEFAULT_OSV_API_BATCH_SIZE,
} from "../foundation/cliArgs";
import { createStubOsvScannerPort } from "../ports/osvScannerPort";
import {
  SCANNER_MODE_CLI,
  SCANNER_MODE_REST,
  type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";
import type { DependencyCoordinate } from "../types/dependency";
import { err, ok } from "../types/result";
import { createScanner } from "./scanner";

const createStubService = (
  lockResult: Awaited<ReturnType<SecurityService["scan"]>>,
  coordinatesResult?: Awaited<ReturnType<SecurityService["scanCoordinates"]>>
): SecurityService => ({
  scan: async () => lockResult,
  scanCoordinates: async () => coordinatesResult ?? lockResult,
});

const writePackageManifest = async (
  directory: string,
  manifest: { readonly name: string; readonly version: string }
) => {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify(manifest),
    "utf8"
  );
};

describe("scanner", () => {
  test("returns advisories from security service", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(
        ok([
          {
            level: "fatal",
            package: "event-stream",
            url: "https://example.com",
            description: "abc",
          },
        ])
      ),
    });

    const advisories = await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });

    expect(advisories).toEqual([
      {
        level: "fatal",
        package: "event-stream",
        url: "https://example.com",
        description: "abc",
      },
    ]);
  });

  test("returns empty array when no packages", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(ok([])),
    });

    const advisories = await scanner.scan({ packages: [] });
    expect(advisories).toEqual([]);
  });

  test("returns fatal advisory when lock read fails", async () => {
    const scanner = createScanner({
      readLock: async () => err({ type: "lock-read-error", message: "boom" }),
      securityService: createStubService(ok([])),
    });

    const advisories = await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });

    expect(advisories).toEqual([
      {
        level: "fatal",
        package: "bun.lock",
        url: null,
        description: "Failed to read bun.lock: boom",
      },
    ]);
  });

  test("does not invoke legacy resolver when bun.lock missing (new direct conversion)", async () => {
    let legacyCalled = false;
    const scanner = createScanner({
      readLock: async () => err({ type: "lock-not-found" }),
      resolveDependencies: async () => {
        legacyCalled = true;
        return ok([]);
      },
      securityService: createStubService(
        ok([]),
        ok([
          {
            level: "warn",
            package: "left-pad",
            url: null,
            description: "weak",
          },
        ])
      ),
    });

    const advisories = await scanner.scan({
      packages: [
        { name: "left-pad", version: "1.3.0" },
        { name: "left-pad", version: "1.3.0" }, // duplicate
      ],
    });

    expect(legacyCalled).toBe(false);
    expect(advisories).toEqual([
      {
        level: "warn",
        package: "left-pad",
        url: null,
        description: "weak",
      },
    ]);
  });

  test("direct package conversion when bun.lock missing (no legacy fallback)", async () => {
    const scanner = createScanner({
      readLock: async () => err({ type: "lock-not-found" }),
      securityService: createStubService(
        ok([]),
        ok([
          {
            level: "warn",
            package: "alpha",
            url: null,
            description: "weak",
          },
        ])
      ),
    });

    const advisories = await scanner.scan({
      packages: [
        { name: "alpha", version: "1.0.0" },
        { name: "alpha", version: "1.0.0" }, // duplicate to test dedupe
      ],
    });

    expect(advisories).toEqual([
      {
        level: "warn",
        package: "alpha",
        url: null,
        description: "weak",
      },
    ]);
  });

  test("legacy filesystem fallback can be enabled via env flag", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scanner-node-modules-"));
    const nodeModules = join(workspace, "node_modules");
    await writePackageManifest(join(nodeModules, "alpha"), {
      name: "alpha",
      version: "1.0.0",
    });
    const originalCwd = process.cwd();
    const originalEnv = process.env.BUN_OSV_ENABLE_FS_FALLBACK;
    process.env.BUN_OSV_ENABLE_FS_FALLBACK = "1";
    process.chdir(workspace);

    try {
      let captured: ReadonlyArray<DependencyCoordinate> | null = null;
      const scanner = createScanner({
        readLock: async () => err({ type: "lock-not-found" }),
        securityService: {
          async scan() {
            throw new Error("scan should not be called");
          },
          async scanCoordinates(coords) {
            captured = coords;
            return ok([]);
          },
        },
      });

      const advisories = await scanner.scan({
        packages: [{ name: "alpha", version: "^1.0.0" }],
      });

      expect(advisories).toEqual([]);
      expect(captured).not.toBeNull();
      const actual: DependencyCoordinate[] = captured ? [...captured] : [];
      expect(actual).toEqual([
        { ecosystem: "npm", name: "alpha", version: "1.0.0" },
      ]);
    } finally {
      process.env.BUN_OSV_ENABLE_FS_FALLBACK = originalEnv;
      process.chdir(originalCwd);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("returns fatal advisory when service fails", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(
        err({
          type: "osv-scan-error",
          error: { type: "process-failed", message: "bad" },
        })
      ),
    });

    const advisories = await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });

    expect(advisories).toEqual([
      {
        level: "fatal",
        package: "bun.lock",
        url: null,
        description: "OSV scanner failed: bad",
      },
    ]);
  });

  test("configures REST adapter when no CLI args provided", async () => {
    const captured: ScannerRuntimeConfig[] = [];
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(ok([])),
      configure: (config) => {
        captured.push(config);
        return createStubOsvScannerPort(ok({ results: [] }));
      },
    });

    await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });
    expect(captured).toEqual([
      {
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
        policy: { blockMinLevel: "fatal", allowUnsafe: false },
      },
    ]);
  });

  test("configures CLI adapter when mode=cli is provided", async () => {
    const captured: ScannerRuntimeConfig[] = [];
    const scanner = createScanner({
      readLock: async () => ok({}),
      securityService: createStubService(ok([])),
      argv: ["--mode", "cli"],
      configure: (config) => {
        captured.push(config);
        return createStubOsvScannerPort(ok({ results: [] }));
      },
    });

    await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });
    expect(captured[0]?.mode).toBe(SCANNER_MODE_CLI);
  });

  test("returns fatal advisory when CLI args parsing fails", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      argv: ["--unknown"],
      securityService: createStubService(ok([])),
    });

    const advisories = await scanner.scan({
      packages: [{ name: "event-stream", version: "3.3.6" }],
    });

    expect(advisories).toEqual([
      {
        level: "fatal",
        package: "bun.lock",
        url: null,
        description: "Invalid scanner arguments: unknown option --unknown",
      },
    ]);
  });

  test("emits warn advisory when lock differs from provided packages", async () => {
    // Provide lock data with package A only, but packages array has A and B → mismatch
    const lockMock = { packages: { A: { version: "1.0.0" } } };
    const scanner = createScanner({
      readLock: async () => ok(lockMock),
      securityService: createStubService(ok([])),
    });
    const advisories = await scanner.scan({
      packages: [
        { name: "A", version: "1.0.0" },
        { name: "B", version: "2.0.0" },
      ],
    });
    expect(advisories).toEqual([
      {
        level: "warn",
        package: "bun.lock",
        url: null,
        description:
          "Lock contents differ from provided package list (potentially stale lock)",
      },
    ]);
  });

  test("escalates warn to fatal when --block-min-level=warn", async () => {
    const scanner = createScanner({
      readLock: async () => ok({}),
      argv: ["--block-min-level", "warn"],
      securityService: createStubService(
        ok([
          {
            level: "warn",
            package: "alpha",
            url: null,
            description: "weak",
          },
        ])
      ),
    });
    const advisories = await scanner.scan({
      packages: [{ name: "alpha", version: "1.0.0" }],
    });
    expect(advisories).toEqual([
      {
        level: "fatal",
        package: "alpha",
        url: null,
        description: "weak",
      },
    ]);
  });

  test("downgrades fatal to warn when allow unsafe env set", async () => {
    const original = process.env.BUN_OSV_SCANNER_ALLOW_UNSAFE;
    process.env.BUN_OSV_SCANNER_ALLOW_UNSAFE = "1";
    try {
      const scanner = createScanner({
        readLock: async () => ok({}),
        securityService: createStubService(
          ok([
            {
              level: "fatal",
              package: "alpha",
              url: null,
              description: "critical vuln",
            },
          ])
        ),
      });
      const advisories = await scanner.scan({
        packages: [{ name: "alpha", version: "1.0.0" }],
      });
      expect(advisories).toEqual([
        {
          level: "warn",
          package: "alpha",
          url: null,
          description: "critical vuln",
        },
      ]);
    } finally {
      process.env.BUN_OSV_SCANNER_ALLOW_UNSAFE = original;
    }
  });

  test("debug logging disabled by default", async () => {
    const original = process.env.BUN_OSV_DEBUG;
    delete process.env.BUN_OSV_DEBUG;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      if (typeof message === "string") logs.push(message);
    };
    try {
      const scanner = createScanner({
        readLock: async () => err({ type: "lock-not-found" }),
        securityService: createStubService(
          ok([]),
          ok([
            {
              level: "warn",
              package: "alpha",
              url: null,
              description: "weak",
            },
          ])
        ),
      });
      await scanner.scan({ packages: [{ name: "alpha", version: "1.0.0" }] });
      expect(logs.length).toBe(0);
    } finally {
      process.env.BUN_OSV_DEBUG = original;
      console.log = originalLog;
    }
  });

  test("debug logging emits JSON line when enabled", async () => {
    const original = process.env.BUN_OSV_DEBUG;
    process.env.BUN_OSV_DEBUG = "1";
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      if (typeof message === "string") logs.push(message);
    };
    try {
      const scanner = createScanner({
        readLock: async () => err({ type: "lock-not-found" }),
        securityService: createStubService(
          ok([]),
          ok([
            {
              level: "warn",
              package: "beta",
              url: null,
              description: "weak",
            },
          ])
        ),
      });
      await scanner.scan({ packages: [{ name: "beta", version: "2.0.0" }] });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(logs[0] ?? "{}");
      expect(parsed.phase).toBe("pre-install-scan");
      expect(typeof parsed.packages).toBe("number");
    } finally {
      process.env.BUN_OSV_DEBUG = original;
      console.log = originalLog;
    }
  });
});
