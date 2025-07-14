export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  retries = 2,
  baseDelay = 500
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt))
      }
    }
  }

  throw lastError
}
