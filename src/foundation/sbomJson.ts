/**
 * @file Parser for translating CycloneDX SBOM JSON strings into dependency coordinates.
 */

import {
	DEPENDENCY_ECOSYSTEM_NPM,
	type DependencyCoordinate,
} from "../types/dependency";
import { err, ok, type Result } from "../types/result";

/**
 * Error identifier returned when the SBOM JSON string cannot be parsed.
 */
export const PARSE_SBOM_ERROR_INVALID_JSON = "invalid-json" as const;

/**
 * Error identifier returned when the parsed SBOM value is not an object.
 */
export const PARSE_SBOM_ERROR_INVALID_DOCUMENT = "invalid-document" as const;

/**
 * Error identifier returned when the SBOM document is missing the components array.
 */
export const PARSE_SBOM_ERROR_MISSING_COMPONENTS =
	"missing-components" as const;

/**
 * Error variants produced while parsing a CycloneDX SBOM JSON string.
 */
export type ParseSbomJsonError =
	| typeof PARSE_SBOM_ERROR_INVALID_JSON
	| typeof PARSE_SBOM_ERROR_INVALID_DOCUMENT
	| typeof PARSE_SBOM_ERROR_MISSING_COMPONENTS;

/**
 * Parse a CycloneDX SBOM JSON string into dependency coordinates.
 */
export const parseCycloneDxJson = (
	json: string,
): Result<ReadonlyArray<DependencyCoordinate>, ParseSbomJsonError> => {
	let document: unknown;

	try {
		document = JSON.parse(json);
	} catch {
		return err(PARSE_SBOM_ERROR_INVALID_JSON);
	}

	if (!isRecord(document)) {
		return err(PARSE_SBOM_ERROR_INVALID_DOCUMENT);
	}

	const componentsValue = document.components;
	if (!Array.isArray(componentsValue)) {
		return err(PARSE_SBOM_ERROR_MISSING_COMPONENTS);
	}

	const coordinates: DependencyCoordinate[] = [];

	for (const component of componentsValue) {
		const coordinate = toCoordinate(component);
		if (!coordinate) continue;
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
 * Parse a PURL string into its constituent parts.
 */
const parsePurl = (
	value: string,
): {
	readonly ecosystem: string;
	readonly name: string;
	readonly version: string | null;
} | null => {
	if (!value.startsWith("pkg:")) return null;
	const remainder = value.slice(4);
	const slashIndex = remainder.indexOf("/");
	if (slashIndex <= 0) return null;

	const ecosystem = remainder.slice(0, slashIndex);
	if (ecosystem.length === 0) return null;

	const nameAndVersion = remainder.slice(slashIndex + 1);
	if (nameAndVersion.length === 0) return null;

	const atIndex = nameAndVersion.lastIndexOf("@");
	const rawName =
		atIndex >= 0 ? nameAndVersion.slice(0, atIndex) : nameAndVersion;
	const rawVersion = atIndex >= 0 ? nameAndVersion.slice(atIndex + 1) : null;

	const name = rawName
		.split("/")
		.map((segment) => decodeURIComponent(segment))
		.join("/");

	const version = rawVersion && rawVersion.length > 0 ? rawVersion : null;

	return { ecosystem, name, version };
};

/**
 * Convert a CycloneDX component entry into a dependency coordinate.
 */
const toCoordinate = (component: unknown): DependencyCoordinate | null => {
	if (!isRecord(component)) return null;

	const nameValue = component.name;
	const versionValue = component.version;
	const purlValue = component.purl;

	const name =
		typeof nameValue === "string" && nameValue.length > 0 ? nameValue : null;
	let version =
		typeof versionValue === "string" && versionValue.length > 0
			? versionValue
			: null;
	const purl =
		typeof purlValue === "string" && purlValue.length > 0 ? purlValue : null;

	let ecosystem: string | null = null;
	let fallbackName = name;

	if (purl) {
		const parsed = parsePurl(purl);
		if (parsed) {
			ecosystem = parsed.ecosystem;
			fallbackName = fallbackName ?? parsed.name;
			version = version ?? parsed.version;
		}
	}

	if (!fallbackName || !version) {
		return null;
	}

	const resolvedEcosystem = ecosystem ?? DEPENDENCY_ECOSYSTEM_NPM;

	return purl
		? {
				name: fallbackName,
				version,
				ecosystem: resolvedEcosystem,
				purl,
			}
		: {
				name: fallbackName,
				version,
				ecosystem: resolvedEcosystem,
			};
};
