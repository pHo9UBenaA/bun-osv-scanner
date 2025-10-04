/**
 * @file Bootstraps the Bun security scanner with real adapters.
 */

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
	type ParseScannerCliArgsError,
	parseScannerCliArgs,
} from "../foundation/cliArgs";
import type { OsvScannerError, OsvScannerPort } from "../ports/osvScannerPort";
import {
	SCANNER_MODE_REST,
	type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";
import { err, ok, type Result } from "../types/result";

/**
 * Error emitted when the lockfile cannot be read.
 */
export type LockReadError = {
	readonly type: "lock-read-error";
	readonly message: string;
};

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
	try {
		const file = Bun.file("bun.lock");
		const text = await file.text();
		return ok(JSON.parse(text));
	} catch (cause) {
		return err({
			type: "lock-read-error",
			message: (cause as Error).message,
		});
	}
};

/**
 * Options accepted when constructing the scanner.
 */
export type CreateScannerOptions = {
	readonly readLock?: LockReader;
	readonly securityService?: SecurityService;
	readonly osvScanner?: OsvScannerPort;
	readonly argv?: ReadonlyArray<string>;
	readonly parseArgs?: (
		argv: ReadonlyArray<string>,
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
 * Create a Bun security scanner instance.
 */
export const createScanner = (
	options: CreateScannerOptions = {},
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
			if (cliArgsError) {
				return [
					buildFatalAdvisory(
						`Invalid scanner arguments: ${describeCliArgsError(cliArgsError)}`,
					),
				];
			}

			if (!packages || packages.length === 0) {
				return [];
			}

			const lockResult = await readLock();
			if (!lockResult.ok) {
				return [
					buildFatalAdvisory(
						`Failed to read bun.lock: ${lockResult.error.message}`,
					),
				];
			}

			const advisoriesResult = await securityService.scan(lockResult.data);
			if (!advisoriesResult.ok) {
				return [
					buildFatalAdvisory(describeServiceError(advisoriesResult.error)),
				];
			}

			return advisoriesResult.data;
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
