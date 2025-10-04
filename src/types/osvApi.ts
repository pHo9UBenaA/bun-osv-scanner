/**
 * @file Domain types describing the OSV REST API request and response payloads.
 */

import type {
	DependencyEcosystem,
	DependencyName,
	DependencyPackageUrl,
	DependencyVersion,
} from "./dependency";
import type { OsvVulnerability } from "./osv";

/**
 * Represents the package descriptor accepted by OSV REST API queries.
 */
export type OsvApiPackageDescriptor = {
	readonly name?: DependencyName;
	readonly ecosystem?: DependencyEcosystem;
	readonly purl?: DependencyPackageUrl;
};

/**
 * Represents the request body for POST /v1/query.
 */
export type OsvApiQueryRequestBody = {
	readonly commit?: string;
	readonly version?: DependencyVersion;
	readonly package?: OsvApiPackageDescriptor;
	readonly page_token?: string;
};

/**
 * Represents the vulnerability container returned by POST /v1/query.
 */
export type OsvApiQueryResponseBody = {
	readonly vulns: ReadonlyArray<OsvVulnerability>;
	readonly next_page_token?: string;
};

/**
 * Represents an individual query entry within POST /v1/querybatch.
 */
export type OsvApiQueryBatchItem = OsvApiQueryRequestBody;

/**
 * Represents the request body for POST /v1/querybatch.
 */
export type OsvApiQueryBatchRequestBody = {
	readonly queries: ReadonlyArray<OsvApiQueryBatchItem>;
};

/**
 * Represents the minimal vulnerability summary within POST /v1/querybatch responses.
 */
export type OsvApiQueryBatchVulnerability = {
	readonly id: string;
	readonly modified: string;
};

/**
 * Represents an individual query result within POST /v1/querybatch responses.
 */
export type OsvApiQueryBatchResult = {
	readonly vulns: ReadonlyArray<OsvApiQueryBatchVulnerability>;
	readonly next_page_token?: string;
};

/**
 * Represents the response body for POST /v1/querybatch.
 */
export type OsvApiQueryBatchResponseBody = {
	readonly results: ReadonlyArray<OsvApiQueryBatchResult>;
};

/**
 * Represents the detailed vulnerability document returned by GET /v1/vulns/{id}.
 */
export type OsvApiVulnerabilityDetailResponse = OsvVulnerability & {
	readonly schema_version?: string;
	readonly aliases?: ReadonlyArray<string>;
	readonly related?: ReadonlyArray<string>;
};

/**
 * Represents the common error payload returned by OSV REST endpoints.
 */
export type OsvApiErrorResponse = {
	readonly error: string;
};
