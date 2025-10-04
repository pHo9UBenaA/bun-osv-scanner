import { describe, expect, test } from "bun:test";
import {
	PARSE_SBOM_ERROR_INVALID_DOCUMENT,
	PARSE_SBOM_ERROR_INVALID_JSON,
	PARSE_SBOM_ERROR_MISSING_COMPONENTS,
	parseCycloneDxJson,
} from "./sbomJson";

describe("parseCycloneDxJson", () => {
	test("parses dependency coordinates from CycloneDX JSON string", () => {
		const sbom = JSON.stringify({
			bomFormat: "CycloneDX",
			specVersion: "1.4",
			version: 1,
			components: [
				{
					type: "library",
					name: "event-stream",
					version: "3.3.6",
					purl: "pkg:npm/event-stream@3.3.6",
				},
			],
		});

		const result = parseCycloneDxJson(sbom);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data).toEqual([
			{
				name: "event-stream",
				version: "3.3.6",
				ecosystem: "npm",
				purl: "pkg:npm/event-stream@3.3.6",
			},
		]);
	});

	test("returns invalid-json error when JSON cannot be parsed", () => {
		const result = parseCycloneDxJson("not-json");
		expect(result).toEqual({ ok: false, error: PARSE_SBOM_ERROR_INVALID_JSON });
	});

	test("returns invalid-document error when parsed value is not an object", () => {
		const result = parseCycloneDxJson(JSON.stringify(null));
		expect(result).toEqual({
			ok: false,
			error: PARSE_SBOM_ERROR_INVALID_DOCUMENT,
		});
	});

	test("returns missing-components error when components array is absent", () => {
		const result = parseCycloneDxJson(
			JSON.stringify({ bomFormat: "CycloneDX" }),
		);
		expect(result).toEqual({
			ok: false,
			error: PARSE_SBOM_ERROR_MISSING_COMPONENTS,
		});
	});

	test("ignores components without required identifiers", () => {
		const sbom = JSON.stringify({
			components: [
				{ name: "", version: "1.0.0" },
				{ name: "valid", version: "1.0.0", purl: "pkg:npm/valid@1.0.0" },
				{ name: "missing-version" },
			],
		});

		const result = parseCycloneDxJson(sbom);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data).toEqual([
			{
				name: "valid",
				version: "1.0.0",
				ecosystem: "npm",
				purl: "pkg:npm/valid@1.0.0",
			},
		]);
	});
});
