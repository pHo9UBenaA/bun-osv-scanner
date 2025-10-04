import { describe, expect, test } from "bun:test";
import {
	DEPENDENCY_ECOSYSTEM_NPM,
	type DependencyCoordinate,
} from "../types/dependency";
import { generateCycloneDxSbom } from "./sbomGenerator";

const dependencies: ReadonlyArray<DependencyCoordinate> = [
	{ ecosystem: DEPENDENCY_ECOSYSTEM_NPM, name: "oxlint", version: "1.19.0" },
	{
		ecosystem: DEPENDENCY_ECOSYSTEM_NPM,
		name: "@types/bun",
		version: "1.2.20",
	},
];

describe("generateCycloneDxSbom", () => {
	test("produces minimal CycloneDX document with components", () => {
		const result = generateCycloneDxSbom(dependencies);

		expect(result).toEqual({
			bomFormat: "CycloneDX",
			specVersion: "1.4",
			version: 1,
			components: [
				{
					type: "library",
					name: "oxlint",
					version: "1.19.0",
					purl: "pkg:npm/oxlint@1.19.0",
				},
				{
					type: "library",
					name: "@types/bun",
					version: "1.2.20",
					purl: "pkg:npm/%40types/bun@1.2.20",
				},
			],
		});
	});
});
