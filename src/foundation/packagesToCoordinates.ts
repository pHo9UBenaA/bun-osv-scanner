/**
 * @file Provides a pure helper to transform Bun provided packages metadata
 * into internal dependency coordinates for scanning without a lockfile.
 *
 * This helper is intentionally placed in the foundation layer: it contains
 * no domain-specific policy (only structural validation + normalization)
 * and can be reused by higher layers (boot) to avoid filesystem traversal.
 */

import {
	DEPENDENCY_ECOSYSTEM_NPM,
	type DependencyCoordinate,
} from "../types/dependency";
import { err, ok, type Result } from "../types/result";

/** Represents validation errors for converting packages into coordinates. */
export type PackagesToCoordinatesError = {
	readonly type: "invalid-package-metadata";
	readonly message: string;
};

export type PackagesToCoordinatesResult = Result<
	ReadonlyArray<DependencyCoordinate>,
	PackagesToCoordinatesError
>;

/**
 * Convert Bun security hook supplied packages list into dependency coordinates.
 * - Validates required fields (name, version)
 * - Deduplicates on name@version
 * - Ecosystem fixed to npm (current scope)
 */
export const packagesToCoordinates = (
	packages: ReadonlyArray<Bun.Security.Package>,
): PackagesToCoordinatesResult => {
	if (packages.length === 0) {
		return ok([]);
	}

	const seen = new Set<string>();
	const coordinates: DependencyCoordinate[] = [];

	for (const pkg of packages) {
		const name = pkg?.name;
		const version = pkg?.version;

		if (typeof name !== "string" || name.length === 0) {
			return err({
				type: "invalid-package-metadata",
				message: "Package missing name field",
			});
		}
		if (typeof version !== "string" || version.length === 0) {
			return err({
				type: "invalid-package-metadata",
				message: `Package ${name} missing version field`,
			});
		}

		const key = `${name}@${version}`;
		if (seen.has(key)) continue;
		seen.add(key);

		coordinates.push({ ecosystem: DEPENDENCY_ECOSYSTEM_NPM, name, version });
	}

	return ok(coordinates);
};
