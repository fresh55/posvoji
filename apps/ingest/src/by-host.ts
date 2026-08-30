// PoliteClient already holds one lock per host and waits its configured delay
// between two requests to the same host, so a single loop over every URL in
// the dataset spends most of its life idle: while one shelter's server is
// answering, the other ten sit unasked. Grouping the work by host and running
// one worker per host changes only that. Each host still sees its requests one
// at a time, in the order they were queued, at the pace PoliteClient sets. The
// politeness is unchanged; the wall clock is not.

// A future dataset with a hundred shelters must not open a hundred sockets at
// once, so the number of hosts in flight is capped. Twelve is comfortably
// above the current shelter count and well inside what one machine and one
// home connection handle.
export const MAX_HOSTS_IN_FLIGHT = 12;

// The same key PoliteClient locks on (`new URL(url).host`), so a queue here
// maps exactly onto a lock there.
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    // Not a URL anything can parse. Give it its own queue rather than lumping
    // every unparseable string together, and let the caller's own error
    // handling deal with the request itself.
    return url;
  }
}

// Runs `work` over `items`, concurrently across hosts and strictly
// sequentially within one host. Results come back in the order of `items`, not
// the order they finished, so a caller can apply them afterwards and keep the
// output identical to a plain sequential loop.
//
// `work` is expected to handle its own failures: one rejection fails the whole
// batch, exactly as a throw out of a sequential loop would.
export async function mapByHost<T, R>(
  items: readonly T[],
  urlOf: (item: T) => string,
  work: (item: T) => Promise<R>,
  limit: number = MAX_HOSTS_IN_FLIGHT,
): Promise<R[]> {
  // Indices rather than items, so results can be written back into their
  // original positions.
  const queues = new Map<string, number[]>();
  items.forEach((item, index) => {
    const host = hostOf(urlOf(item));
    const queue = queues.get(host);
    if (queue) queue.push(index);
    else queues.set(host, [index]);
  });

  const pending = [...queues.values()];
  const results = new Array<R>(items.length);
  let nextQueue = 0;

  // A runner takes whole queues, never single items, which is what keeps one
  // host to one runner: its URLs are processed in order and never overlap.
  // The cursor is read and advanced in one synchronous step, so two runners
  // cannot take the same queue.
  const runner = async (): Promise<void> => {
    for (;;) {
      const queue = pending[nextQueue++];
      if (!queue) return;
      for (const index of queue) {
        results[index] = await work(items[index]!);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, pending.length) }, () => runner()),
  );
  return results;
}
