import { describe, expect, test } from "bun:test";
import { createOsvScannerApiAdapter } from "./osvScannerApi";

const loadFixture = async (path: string): Promise<string> => {
	return await Bun.file(path).text();
};

type FetchInvocation = {
	readonly input: Parameters<typeof fetch>[0];
	readonly init?: Parameters<typeof fetch>[1];
};

type FetchResponseFactory = (request: FetchInvocation) => Promise<Response>;

const createFetchStub = (
	factories: ReadonlyArray<FetchResponseFactory>,
): ((
	input: Parameters<typeof fetch>[0],
	init?: Parameters<typeof fetch>[1],
) => Promise<Response>) => {
	let callIndex = 0;
	return async (input, init) => {
		const factory = factories[callIndex];
		callIndex += 1;
		if (!factory) {
			throw new Error("unexpected fetch call");
		}
		return await factory({ input, init });
	};
};

describe("createOsvScannerApiAdapter", () => {
	test("returns scan results when API responds successfully", async () => {
		const sbomJson = await loadFixture("fixtures/sbom/sample-sbom.cdx.json");
		const queryBatchBody = await loadFixture(
			"fixtures/osv-api/querybatch-success.json",
		);
		const vulnDetailBody = JSON.parse(
			await loadFixture("fixtures/osv-api/vuln-details.json"),
		);
		vulnDetailBody.id = "GHSA-crit";
		vulnDetailBody.summary = "Critical";
		const fetch = createFetchStub([
			async ({ init }) => {
				expect(init?.method).toBe("POST");
				expect(init?.body).toBeDefined();
				return new Response(queryBatchBody, {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
			async () => {
				return new Response(JSON.stringify(vulnDetailBody), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		]);

		const adapter = createOsvScannerApiAdapter({
			fetch,
			baseUrl: "https://api.osv.dev",
			batchSize: 10,
		});

		const result = await adapter.scan(sbomJson);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.results).toHaveLength(1);
		const finding = result.data.results[0]?.packages[0];
		expect(finding?.vulnerabilities[0]?.id).toBe("GHSA-crit");
	});

	test("aggregates paginated batch results", async () => {
		const sbomJson = await loadFixture("fixtures/sbom/sample-sbom.cdx.json");
		const firstPage = await loadFixture(
			"fixtures/osv-api/querybatch-paginated.json",
		);
		const secondPage = await loadFixture(
			"fixtures/osv-api/querybatch-page2.json",
		);
		const vulnTemplate = JSON.parse(
			await loadFixture("fixtures/osv-api/vuln-details.json"),
		);

		const fetch = createFetchStub([
			async () => new Response(firstPage, { status: 200 }),
			async () => new Response(secondPage, { status: 200 }),
			async () =>
				new Response(JSON.stringify({ ...vulnTemplate, id: "GHSA-first" }), {
					status: 200,
				}),
			async () =>
				new Response(JSON.stringify({ ...vulnTemplate, id: "GHSA-second" }), {
					status: 200,
				}),
		]);

		const adapter = createOsvScannerApiAdapter({
			fetch,
			baseUrl: "https://api.osv.dev",
			batchSize: 1,
		});

		const result = await adapter.scan(sbomJson);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const ids = result.data.results[0]?.packages[0]?.vulnerabilities.map(
			(vuln) => vuln.id,
		);
		expect(ids).toEqual(["GHSA-first", "GHSA-second"]);
	});

	test("returns invalid-status error when querybatch responds with HTTP error", async () => {
		const sbomJson = await loadFixture("fixtures/sbom/sample-sbom.cdx.json");
		const fetch = createFetchStub([
			async () =>
				new Response("boom", {
					status: 500,
				}),
		]);

		const adapter = createOsvScannerApiAdapter({
			fetch,
			baseUrl: "https://api.osv.dev",
			batchSize: 10,
		});

		const result = await adapter.scan(sbomJson);
		expect(result).toEqual({
			ok: false,
			error: {
				type: "invalid-status",
				status: 500,
				body: "boom",
			},
		});
	});

	test("returns network-error when fetch rejects", async () => {
		const sbomJson = await loadFixture("fixtures/sbom/sample-sbom.cdx.json");
		const fetch = async () => {
			throw new Error("network down");
		};

		const adapter = createOsvScannerApiAdapter({
			fetch,
			baseUrl: "https://api.osv.dev",
			batchSize: 10,
		});

		const result = await adapter.scan(sbomJson);
		expect(result).toEqual({
			ok: false,
			error: {
				type: "network-error",
				message: "network down",
			},
		});
	});

	test("returns invalid-json when response body cannot be parsed", async () => {
		const sbomJson = await loadFixture("fixtures/sbom/sample-sbom.cdx.json");
		const fetch = createFetchStub([
			async () => new Response("not-json", { status: 200 }),
		]);

		const adapter = createOsvScannerApiAdapter({
			fetch,
			baseUrl: "https://api.osv.dev",
			batchSize: 10,
		});

		const result = await adapter.scan(sbomJson);
		expect(result).toEqual({
			ok: false,
			error: {
				type: "invalid-json",
				message: "Failed to parse OSV API response JSON",
			},
		});
	});
});
