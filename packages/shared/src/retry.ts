import { createLogger } from "./logger.js";

const log = createLogger("retry");

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2 } = opts;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn({ attempt, maxAttempts, error: lastError.message }, "Attempt failed");
      if (attempt < maxAttempts) {
        const wait = delayMs * backoffMultiplier ** (attempt - 1);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}
