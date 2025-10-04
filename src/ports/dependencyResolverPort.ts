/**
 * @file Port definition for resolving dependency coordinates when `bun.lock` is unavailable.
 */

import type { DependencyCoordinate } from "../types/dependency";
import type { Result } from "../types/result";

/**
 * Represents failures that may occur while collecting dependency coordinates.
 */
export type ResolveDependenciesError =
	| { readonly type: "manifest-read-error"; readonly message: string }
	| { readonly type: "dependency-resolution-error"; readonly message: string };

/**
 * Represents the result of resolving dependency coordinates.
 */
export type ResolveDependenciesResult = Result<
	ReadonlyArray<DependencyCoordinate>,
	ResolveDependenciesError
>;

/**
 * Represents the capability required to resolve dependency coordinates without a lockfile.
 */
export type DependencyResolver = (request: {
	readonly packages: ReadonlyArray<Bun.Security.Package>;
}) => Promise<ResolveDependenciesResult>;
