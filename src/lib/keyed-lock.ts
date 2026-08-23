const locks = new Map<string, Promise<void>>();

/**
 * Process-local mutex keyed by an arbitrary string (tenant:student:month, …).
 * Waiters chain off the previous tail; the map entry is dropped when the last
 * waiter for that key finishes so the map cannot grow without bound.
 */
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => current);
  locks.set(key, tail);
  await prior;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export function clearKeyLocksForTests() {
  locks.clear();
}
