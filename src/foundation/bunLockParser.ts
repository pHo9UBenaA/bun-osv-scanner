/**
 * @file Parser for translating Bun lockfile JSON into dependency coordinates.
 */

import {
	DEPENDENCY_ECOSYSTEM_NPM,
	type DependencyCoordinate,
} from "../types/dependency";
import { err, ok, type Result } from "../types/result";

/**
 * Lockfile property key that stores resolved packages.
 */
const BUN_LOCK_KEY_PACKAGES = "packages" as const;

/**
 * Error identifiers emitted by the parser.
 */
export const PARSE_ERROR_INVALID_DOCUMENT = "invalid-document" as const;
export const PARSE_ERROR_MISSING_PACKAGES = "missing-packages" as const;

/**
 * Represents parser error variants.
 */
export type ParseBunLockError =
	| typeof PARSE_ERROR_INVALID_DOCUMENT
	| typeof PARSE_ERROR_MISSING_PACKAGES;

/**
 * Represents the structure of the `packages` record within a Bun lockfile.
 */
type BunLockPackages = Record<string, BunLockPackageEntry>;

/**
 * Represents a Bun lockfile package entry array.
 */
type BunLockPackageEntry = ReadonlyArray<unknown>;

/**
 * Parse a Bun lockfile JSON value into dependency coordinates.
 */
export const parseBunLock = (
	document: unknown,
): Result<ReadonlyArray<DependencyCoordinate>, ParseBunLockError> => {
	if (!isRecord(document)) {
		return err(PARSE_ERROR_INVALID_DOCUMENT);
	}

	const packagesValue = document[BUN_LOCK_KEY_PACKAGES];

	if (!isRecord(packagesValue)) {
		return err(PARSE_ERROR_MISSING_PACKAGES);
	}

	const coordinates: DependencyCoordinate[] = [];

	for (const entry of Object.values(packagesValue as BunLockPackages)) {
		if (!Array.isArray(entry) || entry.length === 0) continue;
		const spec = entry[0];
		if (typeof spec !== "string" || spec.length === 0) continue;

		const coordinate = toCoordinate(spec);
		if (coordinate === null) continue;

		coordinates.push(coordinate);
	}

	return ok(coordinates);
};

/**
 * Determine whether the provided value is a record-like object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null;
};

/**
 * Convert a Bun package spec string (e.g., "oxlint@1.19.0") to a dependency coordinate.
 */
const toCoordinate = (spec: string): DependencyCoordinate | null => {
	const atIndex = spec.lastIndexOf("@");
	if (atIndex <= 0 || atIndex === spec.length - 1) {
		return null;
	}

	const name = spec.slice(0, atIndex);
	const version = spec.slice(atIndex + 1);

	return {
		name,
		version,
		ecosystem: DEPENDENCY_ECOSYSTEM_NPM,
	};
};
