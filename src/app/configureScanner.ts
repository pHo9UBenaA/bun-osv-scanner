/**
 * @file Application-level configuration for selecting the OSV scanner adapter.
 */

import {
	createOsvScannerApiAdapter,
	type OsvScannerApiAdapterOptions,
} from "../adapters/osvScannerApi";
import {
	createOsvScannerCliAdapter,
	type OsvScannerCliOptions,
} from "../adapters/osvScannerCli";
import type { OsvScannerPort } from "../ports/osvScannerPort";
import {
	SCANNER_MODE_CLI,
	type ScannerRuntimeConfig,
} from "../ports/scannerConfigPort";

/**
 * Optional dependencies for configuring the scanner adapters.
 */
export type ConfigureScannerDependencies = {
	readonly fetch?: (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => Promise<Response>;
	readonly createApiAdapter?: (
		options: OsvScannerApiAdapterOptions,
	) => OsvScannerPort;
	readonly createCliAdapter?: (options: OsvScannerCliOptions) => OsvScannerPort;
};

/**
 * Build an OSV scanner port from runtime configuration.
 */
export const configureScanner = (
	config: ScannerRuntimeConfig,
	dependencies: ConfigureScannerDependencies = {},
): OsvScannerPort => {
	const createApi = dependencies.createApiAdapter ?? createOsvScannerApiAdapter;
	const createCli = dependencies.createCliAdapter ?? createOsvScannerCliAdapter;

	if (config.mode === SCANNER_MODE_CLI) {
		return createCli({
			command: config.cli.command ?? undefined,
			workingDirectory: config.cli.workingDirectory ?? null,
			tempDirectory: config.cli.tempFileDirectory ?? null,
		});
	}

	const fetchImpl = dependencies.fetch ?? fetch;

	return createApi({
		fetch: fetchImpl,
		baseUrl: config.api.baseUrl,
		batchSize: config.api.batchSize,
	});
};
