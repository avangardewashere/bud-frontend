/**
 * What this tab remembers that the server has not caught up with.
 *
 * Two panels keep such a memory. The notes panel remembers what it last knew a note to
 * be, because a page can be replayed from the browser's cache long after it was
 * rendered; the hand-in panel remembers a link that has been typed but not handed in,
 * because closing the panel unmounts it. Both are deliberately more current than the
 * page they were rendered from — that is the whole point of them.
 *
 * Which is exactly why they are registered here: this is one learner's unsent work,
 * and it must not still be sitting in the tab when the next person signs in. Signing
 * out clears every registered map (SignOutButton), in the same breath as the write
 * queue it abandons.
 */

const registered: Array<Map<string, unknown>> = [];

/** A map that lives as long as the tab does, and no longer than the session. */
export function tabMemory<T>(): Map<string, T> {
  const memory = new Map<string, T>();
  registered.push(memory as Map<string, unknown>);
  return memory;
}

/** Signing out: whatever this tab was holding for the last learner, it now forgets. */
export function forgetTabMemory() {
  for (const memory of registered) memory.clear();
}
