/**
 * @file Parser for translating CLI arguments into scanner runtime configuration.
 */

import {
	SCANNER_MODE_CLI,
	SCANNER_MODE_REST,
	type ScannerMode,
	type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";
import { err, ok, type Result } from "../types/result";

/**
 * Default OSV REST API base URL.
 */
export const DEFAULT_OSV_API_BASE_URL = "https://api.osv.dev" as const;

/**
 * Default batch size for OSV querybatch requests.
 */
export const DEFAULT_OSV_API_BATCH_SIZE = 32 as const;

/**
 * Set of supported CLI options.
 */
const KNOWN_OPTIONS = new Set([
	"--mode",
	"--api-base-url",
	"--api-batch-size",
	"--cli-command",
	"--cli-cwd",
	"--cli-temp-dir",
	"--block-min-level",
]);

/**
 * Error identifier for unknown CLI options.
 */
export const CLI_ARGS_ERROR_UNKNOWN_OPTION = "unknown-option" as const;

/**
 * Error identifier for options missing a value.
 */
export const CLI_ARGS_ERROR_MISSING_VALUE = "missing-value" as const;

/**
 * Error identifier for invalid scanner modes.
 */
export const CLI_ARGS_ERROR_INVALID_MODE = "invalid-mode" as const;

/**
 * Error identifier for invalid batch size values.
 */
export const CLI_ARGS_ERROR_INVALID_BATCH_SIZE = "invalid-batch-size" as const;

/**
 * Error variants produced while parsing scanner CLI arguments.
 */
export type ParseScannerCliArgsError =
	| {
			readonly type: typeof CLI_ARGS_ERROR_UNKNOWN_OPTION;
			readonly option: string;
	  }
	| {
			readonly type: typeof CLI_ARGS_ERROR_MISSING_VALUE;
			readonly option: string;
	  }
	| {
			readonly type: typeof CLI_ARGS_ERROR_INVALID_MODE;
			readonly value: string;
	  }
	| {
			readonly type: typeof CLI_ARGS_ERROR_INVALID_BATCH_SIZE;
			readonly value: string;
	  };

/**
 * Parse CLI arguments into a scanner runtime configuration.
 */
export const parseScannerCliArgs = (
	argv: ReadonlyArray<string>,
): Result<ScannerRuntimeConfig, ParseScannerCliArgsError> => {
	let mode: ScannerMode = SCANNER_MODE_REST;
	let apiBaseUrl: string = DEFAULT_OSV_API_BASE_URL;
	let apiBatchSize: number = DEFAULT_OSV_API_BATCH_SIZE;

	let cliCommand: string[] | null = null;
	let cliWorkingDirectory: string | null = null;
	let cliTempFileDirectory: string | null = null;

	let blockMinLevel: "fatal" | "warn" =
		process.env.BUN_OSV_BLOCK_MIN_LEVEL === "warn" ? "warn" : "fatal";
	const allowUnsafe = process.env.BUN_OSV_SCANNER_ALLOW_UNSAFE === "1";

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index] ?? "";
		if (!token.startsWith("--")) {
			return err({ type: CLI_ARGS_ERROR_UNKNOWN_OPTION, option: token });
		}

		const { option, inlineValue } = splitOption(token);
		if (!KNOWN_OPTIONS.has(option)) {
			return err({ type: CLI_ARGS_ERROR_UNKNOWN_OPTION, option });
		}

		let value = inlineValue;

		if (value === null) {
			const next = argv[index + 1];
			if (!next || next.startsWith("--")) {
				return err({ type: CLI_ARGS_ERROR_MISSING_VALUE, option });
			}
			value = next;
			index += 1;
		}

		switch (option) {
			case "--mode": {
				const normalized = value.toLowerCase();
				if (normalized === SCANNER_MODE_REST) {
					mode = SCANNER_MODE_REST;
				} else if (normalized === SCANNER_MODE_CLI) {
					mode = SCANNER_MODE_CLI;
				} else {
					return err({ type: CLI_ARGS_ERROR_INVALID_MODE, value });
				}
				break;
			}
			case "--api-base-url": {
				apiBaseUrl = value;
				break;
			}
			case "--api-batch-size": {
				const parsed = Number.parseInt(value, 10);
				if (!Number.isFinite(parsed) || parsed <= 0) {
					return err({ type: CLI_ARGS_ERROR_INVALID_BATCH_SIZE, value });
				}
				apiBatchSize = parsed;
				break;
			}
			case "--cli-command": {
				if (cliCommand === null) {
					cliCommand = [];
				}
				cliCommand.push(value);
				break;
			}
			case "--cli-cwd": {
				cliWorkingDirectory = value;
				break;
			}
			case "--cli-temp-dir": {
				cliTempFileDirectory = value;
				break;
			}
			case "--block-min-level": {
				const v = value.toLowerCase();
				if (v === "fatal" || v === "warn") {
					blockMinLevel = v;
					break;
				}
				return err({ type: CLI_ARGS_ERROR_UNKNOWN_OPTION, option });
			}
			default: {
				return err({ type: CLI_ARGS_ERROR_UNKNOWN_OPTION, option });
			}
		}
	}

	return ok({
		mode,
		api: {
			baseUrl: apiBaseUrl,
			batchSize: apiBatchSize,
		},
		cli: {
			command: cliCommand,
			workingDirectory: cliWorkingDirectory,
			tempFileDirectory: cliTempFileDirectory,
		},
		policy: {
			blockMinLevel,
			allowUnsafe,
		},
	});
};

/**
 * Split a CLI option token into the option name and inline value when present.
 */
const splitOption = (
	token: string,
): { readonly option: string; readonly inlineValue: string | null } => {
	const equalIndex = token.indexOf("=");
	if (equalIndex <= 0) {
		return { option: token, inlineValue: null };
	}

	return {
		option: token.slice(0, equalIndex),
		inlineValue: token.slice(equalIndex + 1),
	};
};
