import { describe, expect, test } from "bun:test";
import {
	SCANNER_MODE_CLI,
	SCANNER_MODE_REST,
	type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";
import { ok } from "../types/result";
import { configureScanner } from "./configureScanner";

const createConfig = (
	mode: typeof SCANNER_MODE_REST | typeof SCANNER_MODE_CLI,
): ScannerRuntimeConfig => ({
	mode,
	api: { baseUrl: "https://api.osv.dev", batchSize: 32 },
	cli: { command: null, workingDirectory: null, tempFileDirectory: null },
});

describe("configureScanner", () => {
	test("creates REST adapter when mode is rest", async () => {
		const invoked: Array<ReadonlyArray<any>> = [];
		const scanner = configureScanner(createConfig(SCANNER_MODE_REST), {
			createApiAdapter: (options) => {
				invoked.push([options.baseUrl, options.batchSize]);
				return {
					scan: async () => ok({ results: [] }),
				};
			},
		});

		const result = await scanner.scan("{}");
		expect(result.ok).toBe(true);
		expect(invoked).toEqual([["https://api.osv.dev", 32]]);
	});

	test("creates CLI adapter when mode is cli", async () => {
		const config: ScannerRuntimeConfig = {
			mode: SCANNER_MODE_CLI,
			api: { baseUrl: "https://api.osv.dev", batchSize: 16 },
			cli: {
				command: ["osv"],
				workingDirectory: "/tmp",
				tempFileDirectory: "/tmp/work",
			},
		};

		const captured: Array<ReadonlyArray<any>> = [];
		const scanner = configureScanner(config, {
			createCliAdapter: (options) => {
				captured.push([
					options.command,
					options.workingDirectory,
					options.tempDirectory,
				]);
				return {
					scan: async () => ok({ results: [] }),
				};
			},
		});

		await scanner.scan("{}");
		expect(captured).toEqual([
			[
				config.cli.command,
				config.cli.workingDirectory,
				config.cli.tempFileDirectory,
			],
		]);
	});
});
