/**
 * @file Utilities for parsing JSON with relaxed syntax rules.
 */

import { err, ok, type Result } from "../types/result";

/**
 * Parse JSON text while tolerating trailing commas outside of string literals.
 */
export const parseLenientJson = (text: string): Result<unknown, string> => {
	const direct = tryParseJson(text);
	if (direct.ok) {
		return direct;
	}

	const sanitized = stripTrailingCommas(text);
	const sanitizedResult = tryParseJson(sanitized);
	if (sanitizedResult.ok) {
		return sanitizedResult;
	}

	return err(sanitizedResult.error);
};

/**
 * Attempt to parse JSON text using the runtime JSON parser.
 */
const tryParseJson = (text: string): Result<unknown, string> => {
	try {
		return ok(JSON.parse(text));
	} catch (cause) {
		return err((cause as Error).message);
	}
};

/**
 * Remove trailing commas that appear before closing array or object delimiters.
 */
const stripTrailingCommas = (text: string): string => {
	const builder: string[] = [];
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === undefined) {
			continue;
		}

		if (inString) {
			builder.push(char);
			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === "\\") {
				escaped = true;
				continue;
			}

			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			builder.push(char);
			continue;
		}

		if (char === ",") {
			const next = findNextNonWhitespace(text, index + 1);
			if (next !== null) {
				const nextChar = text[next];
				if (nextChar === "}" || nextChar === "]") {
					continue;
				}
			}
		}

		builder.push(char);
	}

	return builder.join("");
};

/**
 * Find the index of the next non-whitespace character or return null when none exists.
 */
const findNextNonWhitespace = (
	text: string,
	startIndex: number,
): number | null => {
	for (let index = startIndex; index < text.length; index += 1) {
		const char = text[index];
		if (char === undefined) {
			continue;
		}
		if (!isWhitespace(char)) {
			return index;
		}
	}
	return null;
};

/**
 * Determine whether the provided character is considered whitespace in JSON.
 */
const isWhitespace = (char: string): boolean => {
	return char === " " || char === "\n" || char === "\r" || char === "\t";
};
