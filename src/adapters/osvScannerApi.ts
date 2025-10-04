/**
 * @file Adapter for invoking the OSV REST API to perform vulnerability scans.
 */

import {
	buildScanResultsBody,
	type OsvApiResolvedPackageVulnerabilities,
	summarizeQueryBatchResponse,
	toPackageFindings,
} from "../core/osvApiTranslator";
import {
	PARSE_SBOM_ERROR_INVALID_DOCUMENT,
	PARSE_SBOM_ERROR_INVALID_JSON,
	PARSE_SBOM_ERROR_MISSING_COMPONENTS,
	type ParseSbomJsonError,
	parseCycloneDxJson,
} from "../foundation/sbomJson";
import type { OsvScannerError, OsvScannerPort } from "../ports/osvScannerPort";
import type { DependencyCoordinate } from "../types/dependency";
import type {
	OsvApiQueryBatchRequestBody,
	OsvApiQueryBatchResponseBody,
	OsvApiQueryRequestBody,
	OsvApiVulnerabilityDetailResponse,
} from "../types/osvApi";
import { err, ok, type Result } from "../types/result";

/**
 * Literal source path reported for REST-originated scan results.
 */
const SOURCE_PATH_OSV_API = "osv-rest-api" as const;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

/**
 * Options accepted by the OSV REST API adapter.
 */
export type OsvScannerApiAdapterOptions = {
	readonly fetch: (input: FetchInput, init?: FetchInit) => Promise<Response>;
	readonly baseUrl: string;
	readonly batchSize: number;
	readonly logger?: (message: string) => void;
};

/**
 * Create an OSV scanner adapter backed by the REST API.
 */
export const createOsvScannerApiAdapter = (
	options: OsvScannerApiAdapterOptions,
): OsvScannerPort => {
	return {
		async scan(sbomJson) {
			const parsedSbom = parseCycloneDxJson(sbomJson);
			if (!parsedSbom.ok) {
				return err({
					type: "decode-error",
					message: describeSbomParseError(parsedSbom.error),
				});
			}

			const coordinates = parsedSbom.data;
			if (coordinates.length === 0) {
				return ok(buildScanResultsBody(SOURCE_PATH_OSV_API, []));
			}

			const collection = await collectQueryBatchVulnerabilityIds(
				coordinates,
				options,
			);
			if (!collection.ok) {
				return collection;
			}

			const detailMapResult = await fetchVulnerabilityDetails(
				collection.data.uniqueVulnerabilityIds,
				options,
			);
			if (!detailMapResult.ok) {
				return detailMapResult;
			}

			const resolvedPackagesResult = buildResolvedPackages(
				collection.data.entries,
				detailMapResult.data,
			);
			if (!resolvedPackagesResult.ok) {
				return resolvedPackagesResult;
			}

			const findings = toPackageFindings(resolvedPackagesResult.data);
			const body = buildScanResultsBody(SOURCE_PATH_OSV_API, findings);
			return ok(body);
		},
	};
};

/**
 * Describe SBOM parse errors in a human-readable format.
 */
const describeSbomParseError = (error: ParseSbomJsonError): string => {
	switch (error) {
		case PARSE_SBOM_ERROR_INVALID_JSON:
			return "SBOM JSON cannot be parsed";
		case PARSE_SBOM_ERROR_INVALID_DOCUMENT:
			return "SBOM JSON is not a valid object";
		case PARSE_SBOM_ERROR_MISSING_COMPONENTS:
			return "SBOM document is missing components array";
	}
};

/**
 * Represents collected vulnerability identifiers per dependency coordinate.
 */
type CollectedQueryBatchEntries = {
	readonly entries: ReadonlyArray<QueryBatchEntry>;
	readonly uniqueVulnerabilityIds: ReadonlyArray<string>;
};

type QueryBatchEntry = {
	readonly coordinate: DependencyCoordinate;
	readonly vulnerabilityIds: ReadonlyArray<string>;
};

type MutableQueryBatchEntry = {
	readonly coordinate: DependencyCoordinate;
	readonly vulnerabilityIds: string[];
};

/**
 * Gather vulnerability identifiers for each dependency coordinate using the OSV querybatch endpoint.
 */
const collectQueryBatchVulnerabilityIds = async (
	coordinates: ReadonlyArray<DependencyCoordinate>,
	options: OsvScannerApiAdapterOptions,
): Promise<Result<CollectedQueryBatchEntries, OsvScannerError>> => {
	const pending: Array<{
		coordinate: DependencyCoordinate;
		pageToken: string | null;
	}> = coordinates.map((coordinate) => ({ coordinate, pageToken: null }));

	const entriesMap = new Map<string, MutableQueryBatchEntry>();
	const entriesOrder: MutableQueryBatchEntry[] = [];

	while (pending.length > 0) {
		const batch = pending.splice(0, options.batchSize);
		const requestBody: OsvApiQueryBatchRequestBody = {
			queries: batch.map((item) =>
				toQueryRequest(item.coordinate, item.pageToken),
			),
		};

		const queryResult = await postQueryBatch(requestBody, options);
		if (!queryResult.ok) {
			return queryResult;
		}

		const summary = summarizeQueryBatchResponse(
			batch.map((item) => item.coordinate),
			queryResult.data,
		);

		if (!summary.ok) {
			return err({
				type: "invalid-json",
				message: "OSV querybatch response structure did not match request",
			});
		}

		for (const entry of summary.data) {
			const key = coordinateKey(entry.coordinate);
			let state = entriesMap.get(key);
			if (!state) {
				state = {
					coordinate: entry.coordinate,
					vulnerabilityIds: [],
				};
				entriesMap.set(key, state);
				entriesOrder.push(state);
			}
			for (const id of entry.vulnerabilityIds) {
				if (!state.vulnerabilityIds.includes(id)) {
					state.vulnerabilityIds.push(id);
				}
			}

			if (entry.nextPageToken) {
				pending.push({
					coordinate: entry.coordinate,
					pageToken: entry.nextPageToken,
				});
			}
		}
	}

	const entries: QueryBatchEntry[] = entriesOrder.map((entry) => ({
		coordinate: entry.coordinate,
		vulnerabilityIds: [...entry.vulnerabilityIds],
	}));
	const uniqueVulnerabilityIds = Array.from(
		new Set(entries.flatMap((entry) => entry.vulnerabilityIds)),
	);

	return ok({ entries, uniqueVulnerabilityIds });
};

/**
 * Send a querybatch request to the OSV API.
 */
const postQueryBatch = async (
	body: OsvApiQueryBatchRequestBody,
	options: OsvScannerApiAdapterOptions,
): Promise<Result<OsvApiQueryBatchResponseBody, OsvScannerError>> => {
	let response: Response;
	try {
		response = await options.fetch(`${options.baseUrl}/v1/querybatch`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (cause) {
		return err({
			type: "network-error",
			message: (cause as Error).message,
		});
	}

	if (!response.ok) {
		const errorBody = await response.text();
		return err({
			type: "invalid-status",
			status: response.status,
			body: errorBody.length > 0 ? errorBody : null,
		});
	}

	const text = await response.text();
	try {
		return ok(JSON.parse(text) as OsvApiQueryBatchResponseBody);
	} catch {
		return err({
			type: "invalid-json",
			message: "Failed to parse OSV API response JSON",
		});
	}
};

/**
 * Fetch vulnerability detail documents for the collected identifiers.
 */
const fetchVulnerabilityDetails = async (
	ids: ReadonlyArray<string>,
	options: OsvScannerApiAdapterOptions,
): Promise<
	Result<Map<string, OsvApiVulnerabilityDetailResponse>, OsvScannerError>
> => {
	const map = new Map<string, OsvApiVulnerabilityDetailResponse>();

	for (const id of ids) {
		const detailResult = await getVulnerabilityDetail(id, options);
		if (!detailResult.ok) {
			return detailResult;
		}
		map.set(id, detailResult.data);
	}

	return ok(map);
};

/**
 * Fetch a single vulnerability detail document.
 */
const getVulnerabilityDetail = async (
	id: string,
	options: OsvScannerApiAdapterOptions,
): Promise<Result<OsvApiVulnerabilityDetailResponse, OsvScannerError>> => {
	let response: Response;
	try {
		response = await options.fetch(
			`${options.baseUrl}/v1/vulns/${encodeURIComponent(id)}`,
		);
	} catch (cause) {
		return err({
			type: "network-error",
			message: (cause as Error).message,
		});
	}

	if (!response.ok) {
		const errorBody = await response.text();
		return err({
			type: "invalid-status",
			status: response.status,
			body: errorBody.length > 0 ? errorBody : null,
		});
	}

	const text = await response.text();
	try {
		return ok(JSON.parse(text) as OsvApiVulnerabilityDetailResponse);
	} catch {
		return err({
			type: "invalid-json",
			message: "Failed to parse OSV API response JSON",
		});
	}
};

/**
 * Build resolved package vulnerability records from collected identifiers and details.
 */
const buildResolvedPackages = (
	entries: ReadonlyArray<QueryBatchEntry>,
	detailMap: Map<string, OsvApiVulnerabilityDetailResponse>,
): Result<
	ReadonlyArray<OsvApiResolvedPackageVulnerabilities>,
	OsvScannerError
> => {
	const resolved: OsvApiResolvedPackageVulnerabilities[] = [];

	for (const entry of entries) {
		const vulnerabilities: OsvApiVulnerabilityDetailResponse[] = [];
		for (const id of entry.vulnerabilityIds) {
			const detail = detailMap.get(id);
			if (!detail) {
				return err({
					type: "invalid-json",
					message: `Missing OSV vulnerability detail for id ${id}`,
				});
			}
			vulnerabilities.push(detail);
		}
		resolved.push({ coordinate: entry.coordinate, vulnerabilities });
	}

	return ok(resolved);
};

/**
 * Encode a dependency coordinate into the OSV query request format.
 */
const toQueryRequest = (
	coordinate: DependencyCoordinate,
	pageToken: string | null,
): OsvApiQueryRequestBody => {
	const base: OsvApiQueryRequestBody = {
		package: {
			name: coordinate.name,
			ecosystem: coordinate.ecosystem,
		},
		version: coordinate.version,
	};

	if (pageToken) {
		return { ...base, page_token: pageToken };
	}

	return base;
};

/**
 * Produce a stable key for storing per-coordinate aggregation state.
 */
const coordinateKey = (coordinate: DependencyCoordinate): string => {
	return `${coordinate.ecosystem}::${coordinate.name}@${coordinate.version}`;
};
