/**
 * Result pattern for type-safe error handling without throwing exceptions.
 */

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestedFallback?: string;
  retryable: boolean;
}

export type Result<T, E = AppError> =
  | { success: true; value: T }
  | { success: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({
  success: true,
  value,
});

export const Err = <E = AppError>(error: E): Result<never, E> => ({
  success: false,
  error,
});

export function createAppError(
  code: string,
  message: string,
  options?: { details?: Record<string, unknown>; suggestedFallback?: string; retryable?: boolean }
): AppError {
  return {
    code,
    message,
    details: options?.details,
    suggestedFallback: options?.suggestedFallback,
    retryable: options?.retryable ?? false,
  };
}
