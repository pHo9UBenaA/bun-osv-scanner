import { describe, expect, test } from "bun:test";
import type { SecurityService } from "../app/securityService";
import { err, ok } from "../types/result";
import { createScanner } from "./scanner";

const createStubService = (
	result: Awaited<ReturnType<SecurityService["scan"]>>,
): SecurityService => ({
	scan: async () => result,
});

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
});
