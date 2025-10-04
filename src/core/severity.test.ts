import { describe, expect, test } from "bun:test";
import {
	OSV_SEVERITY_LABEL_CRITICAL,
	OSV_SEVERITY_LABEL_MODERATE,
	type OsvPackageFinding,
} from "../types/osv";
import {
	ADVISORY_LEVEL_FATAL,
	ADVISORY_LEVEL_WARN,
	classifyPackageSeverity,
} from "./severity";

const baseFinding: OsvPackageFinding = {
	package: {
		name: "pkg-name",
		version: "1.0.0",
		ecosystem: "npm",
	},
	vulnerabilities: [],
};

describe("classifyPackageSeverity", () => {
	test("returns fatal when any vulnerability is labelled critical", () => {
		const finding: OsvPackageFinding = {
			...baseFinding,
			vulnerabilities: [
				{
					id: "GHSA-1",
					summary: "critical issue",
					severity: [],
					affected: [],
					databaseSpecific: { severity: OSV_SEVERITY_LABEL_CRITICAL },
				},
			],
		};

		expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_FATAL);
	});

	test("returns warn when highest label is moderate", () => {
		const finding: OsvPackageFinding = {
			...baseFinding,
			vulnerabilities: [
				{
					id: "GHSA-2",
					summary: "moderate issue",
					severity: [],
					affected: [],
					databaseSpecific: { severity: OSV_SEVERITY_LABEL_MODERATE },
				},
			],
		};

		expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_WARN);
	});

	test("uses max severity numeric score when labels are unavailable", () => {
		const finding: OsvPackageFinding = {
			...baseFinding,
			vulnerabilities: [
				{
					id: "GHSA-3",
					summary: "no label",
					severity: [],
					affected: [],
				},
			],
			groups: [
				{
					ids: ["GHSA-3"],
					maxSeverity: "8.1",
				},
			],
		};

		expect(classifyPackageSeverity(finding)).toBe(ADVISORY_LEVEL_FATAL);
	});
});
