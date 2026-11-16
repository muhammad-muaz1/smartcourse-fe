/**
 * Run `total` tasks with at most `concurrency` in flight. Workers pull the next index
 * from a shared counter, so a slow task never stalls the queue behind it. Abort stops
 * new tasks from starting; in-flight ones receive the same signal.
 */
export async function runPool(
  total: number,
  concurrency: number,
  task: (index: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (!signal.aborted) {
      const index = next++
      if (index >= total) return
      await task(index, signal)
    }
  }
  const workers = Math.max(1, Math.min(concurrency, total))
  await Promise.all(Array.from({ length: workers }, worker))
}
