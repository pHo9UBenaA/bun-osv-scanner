import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
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
	coordinatesResult?: Awaited<ReturnType<SecurityService["scanCoordinates"]>>,
): SecurityService => ({
	scan: async () => lockResult,
	scanCoordinates: async () => coordinatesResult ?? lockResult,
});

const writePackageManifest = async (
	directory: string,
	manifest: { readonly name: string; readonly version: string },
) => {
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "package.json"),
		JSON.stringify(manifest),
		"utf8",
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
				]),
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

	test("resolves dependencies when bun.lock is missing", async () => {
		const coordinates = [
			{ ecosystem: "npm", name: "left-pad", version: "1.3.0" },
		];
		const capturedRequests: ReadonlyArray<Bun.Security.Package>[] = [];
		const scanner = createScanner({
			readLock: async () => err({ type: "lock-not-found" }),
			resolveDependencies: async ({ packages }) => {
				capturedRequests.push(packages);
				return ok(coordinates);
			},
			securityService: createStubService(
				err({
					type: "osv-scan-error",
					error: { type: "network-error", message: "x" },
				}),
				ok([
					{
						level: "warn",
						package: "left-pad",
						url: null,
						description: "weak",
					},
				]),
			),
		});

		const advisories = await scanner.scan({
			packages: [{ name: "left-pad", version: "^1.3.0" }],
		});

		expect(capturedRequests).toEqual([
			[{ name: "left-pad", version: "^1.3.0" }],
		]);
		expect(advisories).toEqual([
			{
				level: "warn",
				package: "left-pad",
				url: null,
				description: "weak",
			},
		]);
	});

	test("default resolver scans node_modules when bun.lock is missing", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "scanner-node-modules-"));
		const nodeModules = join(workspace, "node_modules");
		await writePackageManifest(join(nodeModules, "alpha"), {
			name: "alpha",
			version: "1.0.0",
		});
		await writePackageManifest(join(nodeModules, "@scope", "beta"), {
			name: "@scope/beta",
			version: "2.0.0",
		});
		await writePackageManifest(
			join(nodeModules, "alpha", "node_modules", "gamma"),
			{
				name: "gamma",
				version: "0.1.0",
			},
		);

		const originalCwd = process.cwd();
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
				{ ecosystem: "npm", name: "@scope/beta", version: "2.0.0" },
				{ ecosystem: "npm", name: "alpha", version: "1.0.0" },
				{ ecosystem: "npm", name: "gamma", version: "0.1.0" },
			]);
		} finally {
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
				}),
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
});
