/**
 * @file Core logic for generating CycloneDX SBOMs from dependency coordinates.
 */

import type { DependencyCoordinate } from "../types/dependency";
import {
	SBOM_COMPONENT_TYPE_LIBRARY,
	SBOM_FORMAT_CYCLONEDX,
	SBOM_SPEC_VERSION_1_4,
	type SbomDocument,
} from "../types/sbom";

/**
 * Encode a name/version pair into a PURL formatted string.
 */
const toPackageUrl = (
	ecosystem: string,
	name: string,
	version: string,
): string => {
	const encodedName = name
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
	return `pkg:${ecosystem}/${encodedName}@${version}`;
};

/**
 * Create a minimal CycloneDX SBOM document from dependency coordinates.
 */
export const generateCycloneDxSbom = (
	coordinates: ReadonlyArray<DependencyCoordinate>,
): SbomDocument => {
	return {
		bomFormat: SBOM_FORMAT_CYCLONEDX,
		specVersion: SBOM_SPEC_VERSION_1_4,
		version: 1,
		components: coordinates.map((coordinate) => ({
			type: SBOM_COMPONENT_TYPE_LIBRARY,
			name: coordinate.name,
			version: coordinate.version,
			purl: toPackageUrl(
				coordinate.ecosystem,
				coordinate.name,
				coordinate.version,
			),
		})),
	};
};
