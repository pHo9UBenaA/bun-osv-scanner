/**
 * @file Bootstraps the Bun security scanner with real adapters.
 */

import { createOsvScannerCliAdapter } from "../adapters/osvScannerCli";
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
import type { OsvScannerPort } from "../ports/osvScannerPort";
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
	const osvScanner = options.osvScanner ?? createOsvScannerCliAdapter();
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
			return `OSV scanner failed: ${error.error.message}`;
	}
};

/**
 * Default scanner instance used by Bun.
 */
export const scanner = createScanner();
