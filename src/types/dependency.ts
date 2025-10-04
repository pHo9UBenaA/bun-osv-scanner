/**
 * @file Domain primitives for describing dependency coordinates resolved from package metadata.
 */

/**
 * Literal marker for the npm ecosystem identifier used by OSV and CycloneDX.
 */
export const DEPENDENCY_ECOSYSTEM_NPM = "npm" as const;

/**
 * Represents a package ecosystem identifier (e.g., npm, PyPI).
 *
 * YAGNI note: current scenarios only require npm, but we keep the type open
 * for additional ecosystems returned by OSV.
 */
export type DependencyEcosystem = string;

/**
 * Represents a semantic version expressed as a string.
 */
export type DependencyVersion = string;

/**
 * Represents a package name used across manifests, SBOMs, and OSV payloads.
 */
export type DependencyName = string;

/**
 * Represents a Package URL (purl) identifier.
 */
export type DependencyPackageUrl = string;

/**
 * Represents a single dependency instance that can be matched across SBOM and OSV reports.
 */
export type DependencyCoordinate = {
	readonly name: DependencyName;
	readonly version: DependencyVersion;
	readonly ecosystem: DependencyEcosystem;
	readonly purl?: DependencyPackageUrl;
};

/**
 * Represents an immutable list of dependency coordinates.
 */
export type DependencyCoordinates = ReadonlyArray<DependencyCoordinate>;
