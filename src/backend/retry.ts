// Retry logic — exponential backoff for transient API errors.
// Moved from core/agent-retry.ts to backend/ where it actually belongs.

export interface RetryOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  onRetry?: (info: { attempt: number; maxRetries: number; reason: string; delayMs: number }) => void;
}

export function isRetryable(error: any): boolean {
  const status = error?.status || error?.statusCode;
  if ([429, 503, 529].includes(status)) return true;
  if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") return true;
  if (error?.message?.includes("overloaded")) return true;
  return false;
}

export async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { signal, maxRetries = 3, onRetry } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(signal);
    } catch (error: any) {
      if (signal?.aborted) throw error;
      if (attempt >= maxRetries || !isRetryable(error)) throw error;

      const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
      const reason = error?.status ? `HTTP ${error.status}` : error?.code || "network error";
      onRetry?.({ attempt: attempt + 1, maxRetries, reason, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
