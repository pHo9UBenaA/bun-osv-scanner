/**
 * @file Pure translation helpers for converting OSV REST API payloads into existing scanner domain models.
 */

import type { DependencyCoordinate } from "../types/dependency";
import type { OsvPackageFinding, OsvScanResultsBody } from "../types/osv";
import type {
	OsvApiQueryBatchResponseBody,
	OsvApiVulnerabilityDetailResponse,
} from "../types/osvApi";
import { err, ok, type Result } from "../types/result";

/**
 * Literal source type used for synthesized OSV scan results.
 */
const SOURCE_TYPE_SBOM = "sbom" as const;

/**
 * Represents the association between a dependency coordinate and returned vulnerability identifiers.
 */
export type OsvApiQueryBatchSummaryEntry = {
	readonly coordinate: DependencyCoordinate;
	readonly vulnerabilityIds: ReadonlyArray<string>;
	readonly nextPageToken: string | null;
};

/**
 * Error variants produced when translating OSV REST API responses.
 */
export type OsvApiTranslatorError = {
	readonly type: "mismatched-results-length";
	readonly expected: number;
	readonly actual: number;
};

/**
 * Summarize a querybatch response by pairing each result with its originating dependency coordinate.
 */
export const summarizeQueryBatchResponse = (
	coordinates: ReadonlyArray<DependencyCoordinate>,
	response: OsvApiQueryBatchResponseBody,
): Result<
	ReadonlyArray<OsvApiQueryBatchSummaryEntry>,
	OsvApiTranslatorError
> => {
	if (response.results.length !== coordinates.length) {
		return err({
			type: "mismatched-results-length",
			expected: coordinates.length,
			actual: response.results.length,
		});
	}

	const summaries: OsvApiQueryBatchSummaryEntry[] = response.results.map(
		(result, index) => ({
			coordinate: coordinates[index]!,
			vulnerabilityIds: result.vulns.map((entry) => entry.id),
			nextPageToken: result.next_page_token ?? null,
		}),
	);

	return ok(summaries);
};

/**
 * Represents a resolved vulnerability set for a dependency coordinate after fetching detail documents.
 */
export type OsvApiResolvedPackageVulnerabilities = {
	readonly coordinate: DependencyCoordinate;
	readonly vulnerabilities: ReadonlyArray<OsvApiVulnerabilityDetailResponse>;
};

/**
 * Convert resolved vulnerability documents into domain package findings, dropping empty entries.
 */
export const toPackageFindings = (
	resolved: ReadonlyArray<OsvApiResolvedPackageVulnerabilities>,
): ReadonlyArray<OsvPackageFinding> => {
	const findings: OsvPackageFinding[] = [];

	for (const entry of resolved) {
		if (entry.vulnerabilities.length === 0) continue;

		findings.push({
			package: entry.coordinate,
			vulnerabilities: entry.vulnerabilities,
		});
	}

	return findings;
};

/**
 * Wrap package findings inside an OSV scan results body with a synthetic source descriptor.
 */
export const buildScanResultsBody = (
	sourcePath: string,
	findings: ReadonlyArray<OsvPackageFinding>,
): OsvScanResultsBody => {
	if (findings.length === 0) {
		return { results: [] };
	}

	return {
		results: [
			{
				source: { path: sourcePath, type: SOURCE_TYPE_SBOM },
				packages: findings,
			},
		],
	};
};
