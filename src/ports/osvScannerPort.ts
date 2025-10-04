/**
 * @file Port definition for invoking OSV scanner using pure abstractions.
 */

import type { OsvScanResultsBody } from "../types/osv";
import type { Result } from "../types/result";

/**
 * Represents failures that may occur when invoking the OSV scanner.
 */
export type OsvScannerError =
	| { readonly type: "process-failed"; readonly message: string }
	| { readonly type: "decode-error"; readonly message: string }
	| { readonly type: "network-error"; readonly message: string }
	| {
			readonly type: "invalid-status";
			readonly status: number;
			readonly body: string | null;
	  }
	| { readonly type: "invalid-json"; readonly message: string };

/**
 * Represents the capability required to run an OSV scan on a serialized SBOM.
 */
export type OsvScannerPort = {
	readonly scan: (
		sbomJson: string,
	) => Promise<Result<OsvScanResultsBody, OsvScannerError>>;
};

/**
 * Creates a stub port that always returns the supplied payload.
 */
export const createStubOsvScannerPort = (
	payload: Result<OsvScanResultsBody, OsvScannerError>,
): OsvScannerPort => ({
	scan: async () => payload,
});
