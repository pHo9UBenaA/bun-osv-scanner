/**
 * @file Port definitions describing runtime configuration for selecting the OSV scanner implementation.
 */

/**
 * Literal identifier for the REST-backed scanner mode.
 */
export const SCANNER_MODE_REST = "rest" as const;

/**
 * Literal identifier for the CLI-backed scanner mode.
 */
export const SCANNER_MODE_CLI = "cli" as const;

/**
 * Represents scanner mode options recognised by the boot layer.
 */
export type ScannerMode = typeof SCANNER_MODE_REST | typeof SCANNER_MODE_CLI;

/**
 * Configuration required to invoke the OSV REST API.
 */
export type ScannerRestConfig = {
	readonly baseUrl: string;
	readonly batchSize: number;
};

/**
 * Configuration overrides for the CLI-based scanner adapter.
 */
export type ScannerCliConfig = {
	readonly command: ReadonlyArray<string> | null;
	readonly workingDirectory: string | null;
	readonly tempFileDirectory: string | null;
};

/**
 * Represents the combined runtime configuration for selecting and configuring the scanner implementation.
 */
export type ScannerRuntimeConfig = {
	readonly mode: ScannerMode;
	readonly api: ScannerRestConfig;
	readonly cli: ScannerCliConfig;
	readonly policy?: {
		/** Minimum level that triggers a block. Default 'fatal'. If 'warn', escalate warns to fatal. */
		readonly blockMinLevel: "fatal" | "warn";
		/** Allow unsafe override: when true downgrade fatal -> warn after policy. */
		readonly allowUnsafe: boolean;
	};
};
