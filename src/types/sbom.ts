/**
 * @file Domain types for representing CycloneDX SBOM documents.
 */

import type {
	DependencyCoordinate,
	DependencyName,
	DependencyPackageUrl,
	DependencyVersion,
} from "./dependency";

/**
 * Literal identifier for CycloneDX formatted SBOMs.
 */
export const SBOM_FORMAT_CYCLONEDX = "CycloneDX" as const;

/**
 * Literal identifier for CycloneDX specification version 1.4.
 */
export const SBOM_SPEC_VERSION_1_4 = "1.4" as const;

/**
 * Literal identifier for CycloneDX library component type.
 */
export const SBOM_COMPONENT_TYPE_LIBRARY = "library" as const;

/**
 * Represents the set of supported SBOM formats.
 */
export type SbomFormat = typeof SBOM_FORMAT_CYCLONEDX;

/**
 * Represents the set of supported CycloneDX specification versions.
 */
export type SbomSpecVersion = typeof SBOM_SPEC_VERSION_1_4;

/**
 * Represents a component entry within a CycloneDX SBOM.
 */
export type SbomComponent = {
	readonly type: typeof SBOM_COMPONENT_TYPE_LIBRARY;
	readonly name: DependencyName;
	readonly version: DependencyVersion;
	readonly purl?: DependencyPackageUrl;
	readonly properties?: Readonly<Record<string, string>>;
};

/**
 * Represents a parsed CycloneDX SBOM document focusing on the minimal subset of fields we require.
 */
export type SbomDocument = {
	readonly bomFormat: SbomFormat;
	readonly specVersion: SbomSpecVersion;
	readonly version: number;
	readonly components: ReadonlyArray<SbomComponent>;
};

/**
 * Represents the result of translating SBOM components into dependency coordinates.
 */
export type SbomDependencies = ReadonlyArray<DependencyCoordinate>;
