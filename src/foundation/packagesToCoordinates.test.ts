import { describe, expect, test } from "bun:test";
import { packagesToCoordinates } from "./packagesToCoordinates";

describe("packagesToCoordinates", () => {
	test("returns empty array when no packages", () => {
		const result = packagesToCoordinates([]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual([]);
		}
	});

	test("deduplicates name@version pairs", () => {
		const result = packagesToCoordinates([
			{ name: "left-pad", version: "1.0.0" },
			{ name: "left-pad", version: "1.0.0" },
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual([
				{ ecosystem: "npm", name: "left-pad", version: "1.0.0" },
			]);
		}
	});

	test("fails fast on missing name", () => {
		const result = packagesToCoordinates([
			// @ts-expect-error intentional invalid
			{ version: "1.0.0" },
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual({
				type: "invalid-package-metadata",
				message: "Package missing name field",
			});
		}
	});

	test("fails fast on missing version", () => {
		const result = packagesToCoordinates([
			// @ts-expect-error intentional invalid
			{ name: "left-pad" },
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual({
				type: "invalid-package-metadata",
				message: "Package left-pad missing version field",
			});
		}
	});
});
