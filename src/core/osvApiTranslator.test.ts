import { describe, expect, test } from "bun:test";
import type { DependencyCoordinate } from "../types/dependency";
import {
	OSV_SEVERITY_LABEL_CRITICAL,
	OSV_SEVERITY_LABEL_LOW,
} from "../types/osv";
import type {
	OsvApiQueryBatchResponseBody,
	OsvApiVulnerabilityDetailResponse,
} from "../types/osvApi";
import {
	buildScanResultsBody,
	summarizeQueryBatchResponse,
	toPackageFindings,
} from "./osvApiTranslator";

describe("osvApiTranslator", () => {
	test("summarizeQueryBatchResponse pairs coordinates with vulnerability ids and pagination tokens", () => {
		const leftPad: DependencyCoordinate = {
			name: "left-pad",
			version: "1.3.0",
			ecosystem: "npm",
		};
		const koko: DependencyCoordinate = {
			name: "koko",
			version: "2.0.0",
			ecosystem: "npm",
		};
		const coordinates: ReadonlyArray<DependencyCoordinate> = [leftPad, koko];

		const response: OsvApiQueryBatchResponseBody = {
			results: [
				{
					vulns: [{ id: "GHSA-aaa", modified: "2024-01-01T00:00:00Z" }],
					next_page_token: "token-1",
				},
				{
					vulns: null,
				},
			],
		};

		const summary = summarizeQueryBatchResponse(coordinates, response);
		expect(summary.ok).toBe(true);
		if (!summary.ok) return;

		expect(summary.data).toEqual([
			{
				coordinate: leftPad,
				vulnerabilityIds: ["GHSA-aaa"],
				nextPageToken: "token-1",
			},
			{
				coordinate: koko,
				vulnerabilityIds: [],
				nextPageToken: null,
			},
		]);
	});

	test("summarizeQueryBatchResponse reports length mismatch", () => {
		const coordinates: ReadonlyArray<DependencyCoordinate> = [
			{ name: "left-pad", version: "1.3.0", ecosystem: "npm" },
		];

		const response: OsvApiQueryBatchResponseBody = {
			results: [{ vulns: [] }, { vulns: [] }],
		};

		const summary = summarizeQueryBatchResponse(coordinates, response);
		expect(summary).toEqual({
			ok: false,
			error: {
				type: "mismatched-results-length",
				expected: 1,
				actual: 2,
			},
		});
	});

	test("toPackageFindings keeps fatal and warn level vulnerabilities while dropping empty entries", () => {
		const critical: OsvApiVulnerabilityDetailResponse = {
			id: "GHSA-critical",
			summary: "critical",
			severity: [{ type: "CVSS_V3", score: "9.8" }],
			affected: [],
			references: [],
			aliases: [],
			related: [],
			schema_version: "1.6.0",
			modified: "2024-01-01T00:00:00Z",
			published: "2024-01-01T00:00:00Z",
			databaseSpecific: {
				severity: OSV_SEVERITY_LABEL_CRITICAL,
			},
		};

		const low: OsvApiVulnerabilityDetailResponse = {
			id: "GHSA-low",
			summary: "low",
			severity: [{ type: "CVSS_V3", score: "3.1" }],
			affected: [],
			references: [],
			aliases: [],
			related: [],
			schema_version: "1.6.0",
			modified: "2024-01-01T00:00:00Z",
			published: "2024-01-01T00:00:00Z",
			databaseSpecific: {
				severity: OSV_SEVERITY_LABEL_LOW,
			},
		};

		const leftPad: DependencyCoordinate = {
			name: "left-pad",
			version: "1.3.0",
			ecosystem: "npm",
		};
		const koko: DependencyCoordinate = {
			name: "koko",
			version: "2.0.0",
			ecosystem: "npm",
		};
		const findings = toPackageFindings([
			{
				coordinate: leftPad,
				vulnerabilities: [critical],
			},
			{
				coordinate: koko,
				vulnerabilities: [low],
			},
			{
				coordinate: { name: "noop", version: "1.0.0", ecosystem: "npm" },
				vulnerabilities: [],
			},
		]);

		expect(findings).toHaveLength(2);
		const [fatalFinding, warnFinding] = findings;
		if (!fatalFinding || !warnFinding) return;
		expect(fatalFinding.package.name).toBe("left-pad");
		expect(fatalFinding.vulnerabilities[0]?.id).toBe("GHSA-critical");
		expect(warnFinding.package.name).toBe("koko");
		expect(warnFinding.vulnerabilities[0]?.id).toBe("GHSA-low");
	});

	test("buildScanResultsBody wraps findings with synthetic source information", () => {
		const findings = toPackageFindings([
			{
				coordinate: { name: "left-pad", version: "1.3.0", ecosystem: "npm" },
				vulnerabilities: [
					{
						id: "GHSA-critical",
						summary: "critical",
						affected: [],
						severity: [],
						references: [],
					},
				],
			},
		]);

		const body = buildScanResultsBody("inline-sbom.cdx.json", findings);

		expect(body).toEqual({
			results: [
				{
					source: { path: "inline-sbom.cdx.json", type: "sbom" },
					packages: findings,
				},
			],
		});
	});

	test("buildScanResultsBody returns empty results when no findings", () => {
		const body = buildScanResultsBody("inline-sbom.cdx.json", []);
		expect(body).toEqual({ results: [] });
	});
});
