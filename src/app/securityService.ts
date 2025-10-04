/**
 * @file Application service composing lock parsing, SBOM generation, and OSV scanning.
 */

import type { AdvisoryLevel } from "../core/severity";
import type { ParseBunLockError } from "../foundation/bunLockParser";
import type { OsvScannerError, OsvScannerPort } from "../ports/osvScannerPort";
import type { DependencyCoordinate } from "../types/dependency";
import type {
	OsvPackageFinding,
	OsvReference,
	OsvScanResultsBody,
	OsvVulnerability,
} from "../types/osv";
import type { Result } from "../types/result";
import { err, ok } from "../types/result";
import type { SbomDocument } from "../types/sbom";

/**
 * Dependencies required to execute a security scan.
 */
export type SecurityServiceDependencies = {
	readonly parseLock: (
		lock: unknown,
	) => Result<ReadonlyArray<DependencyCoordinate>, ParseBunLockError>;
	readonly generateSbom: (
		coordinates: ReadonlyArray<DependencyCoordinate>,
	) => SbomDocument;
	readonly serializeSbom?: (document: SbomDocument) => string;
	readonly classifySeverity: (
		finding: OsvPackageFinding,
	) => AdvisoryLevel | null;
	readonly osvScanner: OsvScannerPort;
};

/**
 * Error variants produced by the security scan service.
 */
export type SecurityServiceError =
	| { readonly type: "lock-parse-error"; readonly error: ParseBunLockError }
	| { readonly type: "sbom-serialization-error"; readonly message: string }
	| { readonly type: "osv-scan-error"; readonly error: OsvScannerError };

/**
 * Represents the capability of orchestrating an OSV-based security scan.
 */
export type SecurityService = {
	readonly scan: (
		lock: unknown,
	) => Promise<
		Result<ReadonlyArray<Bun.Security.Advisory>, SecurityServiceError>
	>;
	readonly scanCoordinates: (
		coordinates: ReadonlyArray<DependencyCoordinate>,
	) => Promise<
		Result<ReadonlyArray<Bun.Security.Advisory>, SecurityServiceError>
	>;
};

/**
 * Create the application service that wires lock parsing, SBOM generation, and OSV execution together.
 */
export const createSecurityService = (
	dependencies: SecurityServiceDependencies,
): SecurityService => {
	const serialize =
		dependencies.serializeSbom ??
		(JSON.stringify as (doc: SbomDocument) => string);

	const executeScan = async (
		coordinates: ReadonlyArray<DependencyCoordinate>,
	): Promise<
		Result<ReadonlyArray<Bun.Security.Advisory>, SecurityServiceError>
	> => {
		const sbomDocument = dependencies.generateSbom(coordinates);

		let sbomJson: string;
		try {
			sbomJson = serialize(sbomDocument);
		} catch (cause) {
			return err({
				type: "sbom-serialization-error",
				message: (cause as Error).message,
			});
		}

		const scanResult = await dependencies.osvScanner.scan(sbomJson);
		if (!scanResult.ok) {
			return err({ type: "osv-scan-error", error: scanResult.error });
		}

		const advisories = buildAdvisories(
			scanResult.data,
			dependencies.classifySeverity,
		);

		return ok(advisories);
	};

	return {
		async scan(lock) {
			const parsed = dependencies.parseLock(lock);
			if (!parsed.ok) {
				return err({ type: "lock-parse-error", error: parsed.error });
			}

			return executeScan(parsed.data);
		},
		scanCoordinates(coordinates) {
			return executeScan(coordinates);
		},
	};
};

/**
 * Convert OSV scan results into Bun security advisories.
 */
const buildAdvisories = (
	body: OsvScanResultsBody,
	classify: (finding: OsvPackageFinding) => AdvisoryLevel | null,
): ReadonlyArray<Bun.Security.Advisory> => {
	const advisories: Bun.Security.Advisory[] = [];

	for (const result of body.results) {
		for (const finding of result.packages) {
			const level = classify(finding);
			if (!level) continue;

			const primary = selectPrimaryVulnerability(finding);
			advisories.push({
				level,
				package: finding.package.name,
				url: primary ? selectReferenceUrl(primary.references ?? []) : null,
				description: primary?.summary ?? primary?.details ?? null,
			});
		}
	}

	return advisories;
};

/**
 * Select the vulnerability entry to display in the advisory.
 */
const selectPrimaryVulnerability = (
	finding: OsvPackageFinding,
): OsvVulnerability | null => {
	if (finding.vulnerabilities.length === 0) return null;
	return finding.vulnerabilities[0] ?? null;
};

/**
 * Pick the most relevant reference URL if available.
 */
const selectReferenceUrl = (
	references: ReadonlyArray<OsvReference>,
): string | null => {
	const advisoryRef = references.find((ref) => ref.type === "ADVISORY");
	if (advisoryRef) return advisoryRef.url;
	const webRef = references.find((ref) => ref.type === "WEB");
	if (webRef) return webRef.url;
	return references[0]?.url ?? null;
};
