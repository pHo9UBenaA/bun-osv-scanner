import { describe, expect, test } from "bun:test";
import { err, ok } from "../types/result";
import { createOsvScannerCliAdapter } from "./osvScannerCli";

const SAMPLE_RESPONSE = {
	results: [],
};

const jsonWithLogs = `Scanned fixture\n${JSON.stringify(SAMPLE_RESPONSE)}`;

describe("createOsvScannerCliAdapter", () => {
	test("returns parsed JSON when command succeeds", async () => {
		const capturedArgs: Array<ReadonlyArray<string>> = [];
		const adapter = createOsvScannerCliAdapter({
			run: async (args) => {
				capturedArgs.push(args);
				return {
					exitCode: 0,
					stdout: jsonWithLogs,
					stderr: "",
				};
			},
			tempFiles: {
				async create(contents) {
					return {
						path: "/tmp/sbom.json",
						dispose: async () => {
							void contents;
						},
					};
				},
			},
		});

		const result = await adapter.scan("{}");

		expect(result).toEqual(ok({ results: [] }));
		expect(capturedArgs).toHaveLength(1);
		expect(capturedArgs[0]?.at(-1)).toBe("/tmp/sbom.json");
	});

	test("returns process-failed error when exit code is non-zero", async () => {
		const adapter = createOsvScannerCliAdapter({
			run: async () => ({ exitCode: 1, stdout: "", stderr: "boom" }),
			tempFiles: {
				async create(contents) {
					return {
						path: "/tmp/sbom.json",
						dispose: async () => {
							void contents;
						},
					};
				},
			},
		});

		const result = await adapter.scan("{}");
		expect(result).toEqual(err({ type: "process-failed", message: "boom" }));
	});

	test("returns decode-error when JSON cannot be parsed", async () => {
		const adapter = createOsvScannerCliAdapter({
			run: async () => ({ exitCode: 0, stdout: "no json here", stderr: "" }),
			tempFiles: {
				async create(contents) {
					return {
						path: "/tmp/sbom.json",
						dispose: async () => {
							void contents;
						},
					};
				},
			},
		});

		const result = await adapter.scan("{}");
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.type).toBe("decode-error");
	});
});
