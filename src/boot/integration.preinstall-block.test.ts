import { describe, expect, test } from "bun:test";
import type { SecurityService } from "../app/securityService";
import { err, ok } from "../types/result";
import { createScanner } from "./scanner";

/**
 * Integration-style test (no real filesystem dependency) asserting that a fatal advisory
 * is produced BEFORE any dependency installation side-effects (simulated) when bun.lock
 * is absent and a vulnerable package is present in the pre-install package list.
 *
 * We simulate this by:
 *  - Forcing bun.lock miss (readLock returns lock-not-found)
 *  - Injecting a SecurityService that returns a fatal advisory for a chosen coordinate
 *  - Asserting the advisory shape and level
 *
 * NOTE: This does not spawn a real `bun install` because the Bun test harness directly
 * drives the scanner. Full end-to-end with actual install timing is covered by manual
 * smoke steps (see docs/SMOKE.md).
 */

describe("integration: blocks vulnerable package pre-install", () => {
  test("emits fatal advisory for vulnerable package without lock", async () => {
    const fatalAdvisory = {
      level: "fatal" as const,
      package: "left-pad",
      url: "https://osv.dev/VULN-1",
      description: "Critical vulnerability (simulated)",
    };

    const stubService: SecurityService = {
      async scan() {
        return ok([fatalAdvisory]);
      },
      async scanCoordinates(coords) {
        // Ensure coordinates contain the vulnerable package as expected
        const match = coords.some(
          (c) => c.name === "left-pad" && c.version === "999.0.0"
        );
        if (!match) {
          return err({
            type: "osv-scan-error" as const,
            error: { type: "process-failed", message: "coordinate mismatch" },
          });
        }
        return ok([fatalAdvisory]);
      },
    };

    const scanner = createScanner({
      readLock: async () => err({ type: "lock-not-found" }),
      securityService: stubService,
    });

    const advisories = await scanner.scan({
      packages: [{ name: "left-pad", version: "999.0.0" }],
    });

    expect(advisories).toEqual([fatalAdvisory]);
  });
});
