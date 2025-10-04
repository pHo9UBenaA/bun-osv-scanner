import { describe, expect, test } from "bun:test";
import { DEPENDENCY_ECOSYSTEM_NPM } from "../types/dependency";
import {
	PARSE_ERROR_INVALID_DOCUMENT,
	PARSE_ERROR_MISSING_PACKAGES,
	parseBunLock,
} from "./bunLockParser";

describe("parseBunLock", () => {
	test("parses dependency coordinates from bun.lock-like object", () => {
		const lock = {
			packages: {
				oxlint: ["oxlint@1.19.0"],
				"@types/bun": ["@types/bun@1.2.20"],
				invalid: [42],
			},
		};

		const result = parseBunLock(lock);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data).toEqual([
			{
				ecosystem: DEPENDENCY_ECOSYSTEM_NPM,
				name: "oxlint",
				version: "1.19.0",
			},
			{
				ecosystem: DEPENDENCY_ECOSYSTEM_NPM,
				name: "@types/bun",
				version: "1.2.20",
			},
		]);
	});

	test("returns error when document is not an object", () => {
		const result = parseBunLock(null);
		expect(result).toEqual({ ok: false, error: PARSE_ERROR_INVALID_DOCUMENT });
	});

	test("returns error when packages record is missing", () => {
		const result = parseBunLock({});
		expect(result).toEqual({ ok: false, error: PARSE_ERROR_MISSING_PACKAGES });
	});
});
