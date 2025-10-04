/**
 * @file Adapter for invoking the local `osv-scanner` CLI.
 */

import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OsvScannerError, OsvScannerPort } from "../ports/osvScannerPort";
import type { OsvScanResultsBody } from "../types/osv";
import { err, ok, type Result } from "../types/result";

/**
 * Default command invocation for scanning a CycloneDX SBOM file.
 */
const DEFAULT_COMMAND = [
	"osv-scanner",
	"scan",
	"source",
	"--format",
	"json",
	"-L",
];

/**
 * Result returned by the command runner.
 */
type CommandExecution = {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
};

/**
 * Abstraction over process execution for testability.
 */
type RunCommand = (
	cmd: ReadonlyArray<string>,
	options?: { readonly cwd?: string | null },
) => Promise<CommandExecution>;

/**
 * Represents a disposable temporary file.
 */
type TempFileHandle = {
	readonly path: string;
	dispose(): Promise<void>;
};

/**
 * Capability for creating temporary files backed by the filesystem.
 */
type TempFileManager = {
	create(contents: string): Promise<TempFileHandle>;
};

/**
 * Options accepted by the CLI adapter factory.
 */
export type OsvScannerCliOptions = {
	readonly command?: ReadonlyArray<string>;
	readonly run?: RunCommand;
	readonly tempFiles?: TempFileManager;
	readonly workingDirectory?: string | null;
	readonly tempDirectory?: string | null;
};

/**
 * Convert a readable stream to a string.
 */
const streamToString = async (
	stream: ReadableStream<Uint8Array> | null,
): Promise<string> => {
	if (!stream) return "";
	return await new Response(stream).text();
};

/**
 * Default implementation of the command runner using `Bun.spawn`.
 */
const defaultRun: RunCommand = async (cmd, options = {}) => {
	const process = Bun.spawn({
		cmd: [...cmd],
		stdout: "pipe",
		stderr: "pipe",
		cwd: options.cwd ?? undefined,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		streamToString(process.stdout),
		streamToString(process.stderr),
		process.exited,
	]);
	return { exitCode, stdout, stderr };
};

/**
 * Default temporary file manager writing into the OS temp directory.
 */
const createDefaultTempFiles = (directory: string | null): TempFileManager => ({
	async create(contents) {
		const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const baseDir = directory ?? tmpdir();
		const path = join(baseDir, `osv-sbom-${uniqueId}.cdx.json`);
		await writeFile(path, contents, "utf8");
		return {
			path,
			async dispose() {
				await rm(path, { force: true }).catch(() => {});
			},
		};
	},
});

/**
 * Extract JSON payload from a mixed stdout string.
 */
const parseJsonOutput = (
	stdout: string,
): Result<OsvScanResultsBody, OsvScannerError> => {
	const jsonStart = stdout.indexOf("{");
	if (jsonStart < 0) {
		return err({
			type: "decode-error",
			message: "osv-scanner did not return JSON output",
		});
	}

	const jsonText = stdout.slice(jsonStart);
	try {
		return ok(JSON.parse(jsonText) as OsvScanResultsBody);
	} catch (cause) {
		return err({
			type: "decode-error",
			message: `failed to parse osv-scanner JSON output: ${(cause as Error).message}`,
		});
	}
};

/**
 * Build an adapter that invokes the local `osv-scanner` CLI.
 */
export const createOsvScannerCliAdapter = (
	options: OsvScannerCliOptions = {},
): OsvScannerPort => {
	const command = options.command ?? DEFAULT_COMMAND;
	const run = options.run ?? defaultRun;
	const tempFiles =
		options.tempFiles ?? createDefaultTempFiles(options.tempDirectory ?? null);
	const workingDirectory = options.workingDirectory ?? null;

	return {
		async scan(sbomJson) {
			const tempFile = await tempFiles.create(sbomJson);
			try {
				const execution = await run([...command, tempFile.path], {
					cwd: workingDirectory,
				});

				if (execution.exitCode !== 0) {
					const errorMessage =
						execution.stderr.trim() || execution.stdout.trim();
					return err({
						type: "process-failed",
						message:
							errorMessage.length > 0
								? errorMessage
								: `osv-scanner exited with code ${execution.exitCode}`,
					});
				}

				const parsed = parseJsonOutput(execution.stdout);
				if (!parsed.ok) {
					return parsed;
				}

				return parsed;
			} finally {
				await tempFile.dispose();
			}
		},
	};
};
