/**
 * @file Tests for the lenient JSON parser utilities.
 */

import { describe, expect, test } from "bun:test";

import { parseLenientJson } from "./lenientJson";

describe("parseLenientJson", () => {
	test("parses strict JSON without modification", () => {
		const result = parseLenientJson('{"name":"bun"}');
		expect(result).toEqual({
			ok: true,
			data: { name: "bun" },
		});
	});

	test("removes trailing commas that follow object properties", () => {
		const source = '{"name":"bun","version":"1.0.0",}';
		const result = parseLenientJson(source);
		expect(result).toEqual({
			ok: true,
			data: { name: "bun", version: "1.0.0" },
		});
	});

	test("removes trailing commas that follow array elements", () => {
		const source = '{"values":["a","b",]}';
		const result = parseLenientJson(source);
		expect(result).toEqual({
			ok: true,
			data: { values: ["a", "b"] },
		});
	});

	test("preserves commas that are part of string literals", () => {
		const source = '{"pattern":",]}"}';
		const result = parseLenientJson(source);
		expect(result).toEqual({
			ok: true,
			data: { pattern: ",]}" },
		});
	});

	test("propagates parsing failures for invalid syntax", () => {
		const result = parseLenientJson("{invalid}");
		expect(result.ok).toBeFalse();
	});
});
