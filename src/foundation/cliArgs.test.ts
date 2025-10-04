import { describe, expect, test } from "bun:test";
import {
	SCANNER_MODE_CLI,
	SCANNER_MODE_REST,
} from "../ports/scannerConfigPort";
import {
	CLI_ARGS_ERROR_INVALID_BATCH_SIZE,
	CLI_ARGS_ERROR_INVALID_MODE,
	CLI_ARGS_ERROR_MISSING_VALUE,
	CLI_ARGS_ERROR_UNKNOWN_OPTION,
	DEFAULT_OSV_API_BASE_URL,
	DEFAULT_OSV_API_BATCH_SIZE,
	parseScannerCliArgs,
} from "./cliArgs";

describe("parseScannerCliArgs", () => {
	test("returns default REST configuration when no arguments are provided", () => {
		const result = parseScannerCliArgs([]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.mode).toBe(SCANNER_MODE_REST);
		expect(result.data.api).toEqual({
			baseUrl: DEFAULT_OSV_API_BASE_URL,
			batchSize: DEFAULT_OSV_API_BATCH_SIZE,
		});
		expect(result.data.cli).toEqual({
			command: null,
			workingDirectory: null,
			tempFileDirectory: null,
		});
	});

	test("parses CLI mode with command override tokens", () => {
		const result = parseScannerCliArgs([
			"--mode",
			"cli",
			"--cli-command=osv-scanner",
			"--cli-command=scan",
			"--cli-command=source",
		]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.mode).toBe(SCANNER_MODE_CLI);
		expect(result.data.cli.command).toEqual(["osv-scanner", "scan", "source"]);
		// API defaults remain even when CLI mode is selected for flexibility.
		expect(result.data.api.baseUrl).toBe(DEFAULT_OSV_API_BASE_URL);
	});

	test("returns error for unknown options", () => {
		const result = parseScannerCliArgs(["--unknown"]);
		expect(result).toEqual({
			ok: false,
			error: {
				type: CLI_ARGS_ERROR_UNKNOWN_OPTION,
				option: "--unknown",
			},
		});
	});

	test("returns error when option value is missing", () => {
		const result = parseScannerCliArgs(["--mode"]);
		expect(result).toEqual({
			ok: false,
			error: {
				type: CLI_ARGS_ERROR_MISSING_VALUE,
				option: "--mode",
			},
		});
	});

	test("returns error when mode value is invalid", () => {
		const result = parseScannerCliArgs(["--mode", "invalid"]);
		expect(result).toEqual({
			ok: false,
			error: {
				type: CLI_ARGS_ERROR_INVALID_MODE,
				value: "invalid",
			},
		});
	});

	test("returns error when batch size is not a positive integer", () => {
		const result = parseScannerCliArgs(["--api-batch-size", "0"]);
		expect(result).toEqual({
			ok: false,
			error: {
				type: CLI_ARGS_ERROR_INVALID_BATCH_SIZE,
				value: "0",
			},
		});
	});
});
