/**
 * @file Generic result algebraic data type helpers.
 */

/**
 * Represents the outcome of a computation that may fail.
 */
export type Result<T, E> =
	| {
			readonly ok: true;
			readonly data: T;
	  }
	| {
			readonly ok: false;
			readonly error: E;
	  };

/**
 * Create a successful `Result`.
 */
export const ok = <T, E>(data: T): Result<T, E> => ({ ok: true, data });

/**
 * Create a failed `Result`.
 */
export const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });
