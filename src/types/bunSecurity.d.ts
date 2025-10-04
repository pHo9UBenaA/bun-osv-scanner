/**
 * @file Ambient declarations for Bun Security scanner API.
 */

type BunSecurityLevel = "fatal" | "warn";

interface BunSecurityPackage {
	readonly name: string;
	readonly version: string;
	readonly requestedRange?: string;
	readonly tarball?: string;
}

interface BunSecurityAdvisory {
	readonly level: BunSecurityLevel;
	readonly package: string;
	readonly url: string | null;
	readonly description: string | null;
}

interface BunSecurityScanInput {
	readonly packages: ReadonlyArray<BunSecurityPackage>;
}

type BunSecurityScanner = {
	readonly version: string;
	scan(
		input: BunSecurityScanInput,
	): Promise<ReadonlyArray<BunSecurityAdvisory>>;
};

declare module "bun" {
	namespace Bun {
		namespace Security {
			type Level = BunSecurityLevel;
			type Package = BunSecurityPackage;
			type Advisory = BunSecurityAdvisory;
			type ScanInput = BunSecurityScanInput;
			type Scanner = BunSecurityScanner;
		}
	}
}

declare global {
	namespace Bun {
		namespace Security {
			type Level = BunSecurityLevel;
			type Package = BunSecurityPackage;
			type Advisory = BunSecurityAdvisory;
			type ScanInput = BunSecurityScanInput;
			type Scanner = BunSecurityScanner;
		}
	}
}

export {};
