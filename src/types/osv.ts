/**
 * @file Domain types for OSV scanner results and vulnerability metadata.
 */

import type {
	DependencyCoordinate,
	DependencyEcosystem,
	DependencyName,
	DependencyPackageUrl,
	DependencyVersion,
} from "./dependency";

/**
 * Literal identifiers for OSV textual severity labels.
 */
export const OSV_SEVERITY_LABEL_CRITICAL = "CRITICAL" as const;
export const OSV_SEVERITY_LABEL_HIGH = "HIGH" as const;
export const OSV_SEVERITY_LABEL_MODERATE = "MODERATE" as const;
export const OSV_SEVERITY_LABEL_LOW = "LOW" as const;

/**
 * Represents the textual severity labels emitted by OSV advisories.
 */
export type OsvSeverityLabel =
	| typeof OSV_SEVERITY_LABEL_CRITICAL
	| typeof OSV_SEVERITY_LABEL_HIGH
	| typeof OSV_SEVERITY_LABEL_MODERATE
	| typeof OSV_SEVERITY_LABEL_LOW
	| string;

/**
 * Represents a CVSS (or other) severity score vector.
 */
export type OsvSeverityScore = {
	readonly type: string;
	readonly score: string;
};

/**
 * Represents a reference entry linked within an OSV advisory.
 */
export type OsvReference = {
	readonly type: string;
	readonly url: string;
};

/**
 * Represents a semver event window (introduced/fixed) for an affected range.
 */
export type OsvAffectedEvent = {
	readonly introduced?: DependencyVersion;
	readonly fixed?: DependencyVersion;
};

/**
 * Represents a semver range block within an affected package definition.
 */
export type OsvAffectedRange = {
	readonly type: string;
	readonly events: ReadonlyArray<OsvAffectedEvent>;
};

/**
 * Represents a package entry within the affected list of an OSV advisory.
 */
export type OsvAffectedPackage = {
	readonly ecosystem: DependencyEcosystem;
	readonly name: DependencyName;
	readonly purl?: DependencyPackageUrl;
};

/**
 * Represents the set of affected package metadata carried by an OSV advisory.
 */
export type OsvAffected = {
	readonly package: OsvAffectedPackage;
	readonly ranges: ReadonlyArray<OsvAffectedRange>;
	readonly versions?: ReadonlyArray<DependencyVersion>;
	readonly databaseSpecific?: {
		readonly source?: string;
		readonly severity?: OsvSeverityLabel;
		readonly cwe_ids?: ReadonlyArray<string>;
	};
	readonly database_specific?: {
		readonly source?: string;
		readonly severity?: OsvSeverityLabel;
		readonly cwe_ids?: ReadonlyArray<string>;
	};
};

/**
 * Represents an individual OSV vulnerability linked to a dependency.
 */
export type OsvVulnerability = {
	readonly id: string;
	readonly summary: string;
	readonly details?: string;
	readonly severity: ReadonlyArray<OsvSeverityScore>;
	readonly affected: ReadonlyArray<OsvAffected>;
	readonly references?: ReadonlyArray<OsvReference>;
	readonly databaseSpecific?: {
		readonly severity?: OsvSeverityLabel;
	};
	readonly database_specific?: {
		readonly severity?: OsvSeverityLabel;
	};
	readonly published?: string;
	readonly modified?: string;
};

/**
 * Represents an aggregated vulnerability group within an OSV package finding.
 */
export type OsvVulnerabilityGroup = {
	readonly ids: ReadonlyArray<string>;
	readonly aliases?: ReadonlyArray<string>;
	readonly maxSeverity?: string;
};

/**
 * Represents the OSV findings for a single package inside a scan result.
 */
export type OsvPackageFinding = {
	readonly package: DependencyCoordinate;
	readonly vulnerabilities: ReadonlyArray<OsvVulnerability>;
	readonly groups?: ReadonlyArray<OsvVulnerabilityGroup>;
};

/**
 * Represents the source artifact description for an OSV scan result entry.
 */
export type OsvResultSource = {
	readonly path: string;
	readonly type: string;
};

/**
 * Represents the OSV scan result for a single source artifact.
 */
export type OsvScanResult = {
	readonly source: OsvResultSource;
	readonly packages: ReadonlyArray<OsvPackageFinding>;
};

/**
 * Represents the complete OSV scanner JSON payload body.
 */
export type OsvScanResultsBody = {
	readonly results: ReadonlyArray<OsvScanResult>;
	readonly experimental_config?: unknown;
};
