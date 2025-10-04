/**
 * @file Core logic for mapping OSV severities to Bun advisory levels.
 */

import {
	OSV_SEVERITY_LABEL_CRITICAL,
	OSV_SEVERITY_LABEL_HIGH,
	OSV_SEVERITY_LABEL_LOW,
	OSV_SEVERITY_LABEL_MODERATE,
	type OsvPackageFinding,
	type OsvSeverityLabel,
} from "../types/osv";

/**
 * Literal advisory level indicating installation must be aborted.
 */
export const ADVISORY_LEVEL_FATAL = "fatal" as const;

/**
 * Literal advisory level indicating installation may proceed with confirmation.
 */
export const ADVISORY_LEVEL_WARN = "warn" as const;

/**
 * Represents advisory levels returned to Bun.
 */
export type AdvisoryLevel =
	| typeof ADVISORY_LEVEL_FATAL
	| typeof ADVISORY_LEVEL_WARN;

/**
 * High/critical severities escalate to fatal advisories.
 */
const FATAL_LABELS = new Set<OsvSeverityLabel>([
	OSV_SEVERITY_LABEL_CRITICAL,
	OSV_SEVERITY_LABEL_HIGH,
]);

/**
 * Moderate/low severities map to warnings when no fatal labels exist.
 */
const WARN_LABELS = new Set<OsvSeverityLabel>([
	OSV_SEVERITY_LABEL_MODERATE,
	OSV_SEVERITY_LABEL_LOW,
]);

/**
 * CVSS base scores at or above this threshold are treated as fatal.
 */
const FATAL_CVSS_THRESHOLD = 7.0;

/**
 * CVSS base scores at or above this threshold are treated as warnings when no fatal signal exists.
 */
const WARN_CVSS_THRESHOLD = 4.0;

/**
 * Extract all textual severity labels from the package findings.
 */
const collectSeverityLabels = (
	finding: OsvPackageFinding,
): ReadonlyArray<OsvSeverityLabel> => {
	return finding.vulnerabilities
		.map((v) => v.databaseSpecific?.severity ?? v.database_specific?.severity)
		.filter(
			(label): label is OsvSeverityLabel =>
				typeof label === "string" && label.length > 0,
		);
};

/**
 * Extract maximum numeric severity score from vulnerability groups or entries.
 */
const findMaxNumericSeverity = (finding: OsvPackageFinding): number | null => {
	const groupScores = (finding.groups ?? [])
		.map((group) => parseFloat(group.maxSeverity ?? ""))
		.filter((score) => Number.isFinite(score));

	const vulnerabilityScores = finding.vulnerabilities
		.flatMap((v) => v.severity)
		.map((signal) => parseFloat(signal.score))
		.filter((score) => Number.isFinite(score));

	const allScores = [...groupScores, ...vulnerabilityScores];

	if (allScores.length === 0) {
		return null;
	}

	return Math.max(...allScores);
};

/**
 * Determine the advisory level Bun should return for the supplied package finding.
 */
export const classifyPackageSeverity = (
	finding: OsvPackageFinding,
): AdvisoryLevel | null => {
	const labels = collectSeverityLabels(finding);

	if (labels.some((label) => FATAL_LABELS.has(label))) {
		return ADVISORY_LEVEL_FATAL;
	}

	const numericSeverity = findMaxNumericSeverity(finding);

	if (numericSeverity !== null && numericSeverity >= FATAL_CVSS_THRESHOLD) {
		return ADVISORY_LEVEL_FATAL;
	}

	if (labels.some((label) => WARN_LABELS.has(label))) {
		return ADVISORY_LEVEL_WARN;
	}

	if (numericSeverity !== null && numericSeverity >= WARN_CVSS_THRESHOLD) {
		return ADVISORY_LEVEL_WARN;
	}

	return null;
};
