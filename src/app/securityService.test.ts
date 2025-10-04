import { describe, expect, test } from "bun:test";
import { generateCycloneDxSbom } from "../core/sbomGenerator";
import { classifyPackageSeverity } from "../core/severity";
import { PARSE_ERROR_INVALID_DOCUMENT } from "../foundation/bunLockParser";
import type { OsvScannerError } from "../ports/osvScannerPort";
import type { OsvScanResultsBody } from "../types/osv";
import { err, ok } from "../types/result";
import { createSecurityService } from "./securityService";

const loadFixture = async (path: string) => {
	const file = Bun.file(path);
	return (await file.json()) as unknown;
};

describe("createSecurityService", () => {
	test("returns advisories when OSV scan reports vulnerabilities", async () => {
		const fixture = (await loadFixture(
			"fixtures/osv/event-stream-osv.json",
		)) as OsvScanResultsBody;

		let capturedSbomJson: string | null = null;
		const service = createSecurityService({
			parseLock: () =>
				ok([{ ecosystem: "npm", name: "event-stream", version: "3.3.6" }]),
			generateSbom: generateCycloneDxSbom,
			classifySeverity: classifyPackageSeverity,
			osvScanner: {
				scan: async (sbomJson) => {
					capturedSbomJson = sbomJson;
					return ok(fixture as any);
				},
			},
		});

		const result = await service.scan({});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(typeof capturedSbomJson).toBe("string");
		expect(result.data).toEqual([
			{
				level: "fatal",
				package: "event-stream",
				url: "https://github.com/advisories/GHSA-mh6f-8j2x-4483",
				description:
					"Critical severity vulnerability that affects event-stream and flatmap-stream",
			},
		]);
	});

	test("scanCoordinates skips lock parsing and returns advisories", async () => {
		const fixture = (await loadFixture(
			"fixtures/osv/event-stream-osv.json",
		)) as OsvScanResultsBody;

		let parseLockCalls = 0;
		const service = createSecurityService({
			parseLock: () => {
				parseLockCalls += 1;
				return ok([]);
			},
			generateSbom: generateCycloneDxSbom,
			classifySeverity: classifyPackageSeverity,
			osvScanner: {
				scan: async () => ok(fixture as any),
			},
		});

		const result = await service.scanCoordinates([
			{ ecosystem: "npm", name: "event-stream", version: "3.3.6" },
		]);

		expect(parseLockCalls).toBe(0);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data[0]?.package).toBe("event-stream");
	});

	test("propagates lock parse errors", async () => {
		const service = createSecurityService({
			parseLock: () => err(PARSE_ERROR_INVALID_DOCUMENT),
			generateSbom: generateCycloneDxSbom,
			classifySeverity: classifyPackageSeverity,
			osvScanner: { scan: async () => ok({ results: [] }) },
		});

		const result = await service.scan({});
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error).toEqual({
			type: "lock-parse-error",
			error: PARSE_ERROR_INVALID_DOCUMENT,
		});
	});

	test("propagates osv scan errors", async () => {
		const scanError: OsvScannerError = {
			type: "process-failed",
			message: "boom",
		};
		const service = createSecurityService({
			parseLock: () => ok([]),
			generateSbom: generateCycloneDxSbom,
			classifySeverity: classifyPackageSeverity,
			osvScanner: { scan: async () => err(scanError) },
		});

		const result = await service.scan({});
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error).toEqual({ type: "osv-scan-error", error: scanError });
	});
});
