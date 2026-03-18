export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}
