// The editor form is one tab crash or accidental Back away from losing a
// shelter's edits, so a typed draft is mirrored to sessionStorage on every
// change and restored from it on mount. sessionStorage rather than
// localStorage because a draft that outlives the tab is a draft that can
// resurface in a different session and get saved as someone else's edit.
//
// A key carries all three of account, shelter and animal id because one
// browser tab can hold two shelters open in two tabs of the same session, and
// because logging out and back in as a different account must not resurrect
// the previous account's unsaved edits. Each part is encodeURIComponent-ed
// before being joined with "/", so a shelter slug or animal id that itself
// contains "/" or ":" cannot be crafted to collide with a different triple.
//
// Storage access is never cached at module load: reading window.sessionStorage
// eagerly would throw during import under SSR (no window) and can throw at
// any time in a browser with storage blocked (private mode, an extension, a
// full quota), so every read and write of it happens inside its own guard.
export const PORTAL_DRAFT_PREFIX = "posvoji.portal.draft:";

export function draftKey(
  account: string,
  shelter: string,
  animalId: string,
): string {
  return `${PORTAL_DRAFT_PREFIX}${encodeURIComponent(account)}/${encodeURIComponent(shelter)}/${encodeURIComponent(animalId)}`;
}

interface DraftKeyParts {
  account: string;
  shelter: string;
  animalId: string;
}

// The inverse of draftKey. Returns null for anything that is not one of ours
// (a foreign prefix, a malformed triple, a part that will not decode) so
// callers that scan every key in storage can skip those keys rather than
// throw partway through a scan.
function parseDraftKey(key: string): DraftKeyParts | null {
  if (!key.startsWith(PORTAL_DRAFT_PREFIX)) return null;
  const parts = key.slice(PORTAL_DRAFT_PREFIX.length).split("/");
  if (parts.length !== 3) return null;
  try {
    const [account, shelter, animalId] = parts.map((part) =>
      decodeURIComponent(part),
    );
    return { account: account!, shelter: shelter!, animalId: animalId! };
  } catch {
    return null;
  }
}

// Listeners registered through subscribeDrafts, notified after every write
// this module makes in this tab. A storage event from another tab is handled
// separately, inside subscribeDrafts itself, since the browser only fires
// that event in tabs other than the one that made the change.
const listeners = new Set<() => void>();

function notifyAll(): void {
  for (const listener of listeners) listener();
}

// What a key holds: a plain object with only the draft keys the shelter has
// changed from the saved record, each with its typed value. Never the whole
// draft. A whole draft would carry every field back over the record on
// resume, so a name typed in one tab would resend the breed that another tab,
// or a crawl in between, had changed since. A key written before this rule
// holds every field; it is a superset of the same shape and goes through the
// same path, resuming every field that still differs from the record.
//
// Text is compared trimmed on both sides. Crawled text can carry trailing
// whitespace the form trims away on save, and without this an untouched form
// would read as changed and leave a key behind.

/** Checks a stored value against the draft the record produces and returns
 *  the keys worth keeping, each with a value of the right type. Anything it
 *  leaves out is dropped. */
export type DraftSanitizer<T extends object> = (
  stored: unknown,
  base: T,
) => Partial<T>;

/** Whether one draft value differs from another. Text is compared trimmed;
 *  everything else by Object.is, since a draft holds only primitives. */
export function draftValueDiffers(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.trim() !== b.trim();
  }
  return !Object.is(a, b);
}

/** The keys of the draft whose value differs from the base, with the
 *  draft's value. Empty when the form is back to what the record says. */
export function draftDiff<T extends object>(draft: T, base: T): Partial<T> {
  const diff: Partial<T> = {};
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (draftValueDiffers(draft[key], base[key])) diff[key] = draft[key];
  }
  return diff;
}

/**
 * What each key of one form's draft may hold. A text key holds a string; a
 * choice key holds one of its answers or null, for a row nobody has answered;
 * a key under `answered` holds one of its answers and never null, which is
 * what a manual listing's status is.
 */
export type DraftFields = {
  text: readonly string[];
  choices: Readonly<Record<string, readonly string[]>>;
  answered?: Readonly<Record<string, readonly string[]>>;
};

function declared(
  table: Readonly<Record<string, readonly string[]>> | undefined,
  key: string,
): readonly string[] | null {
  if (!table) return null;
  if (!Object.prototype.hasOwnProperty.call(table, key)) return null;
  return table[key] ?? null;
}

/**
 * The check one form runs over what the tab stored, from the table of what its
 * draft holds.
 *
 * The draft in sessionStorage was written by whatever version of the form the
 * tab last ran, and by anything else that can write to the tab's storage. Only
 * keys the base draft has are kept, and only with a value the key can hold.
 * Anything else (a null name, a number, an object, an answer the row does not
 * offer, a stored value that is not an object at all) is dropped and the base's
 * own value stands. A missing key would otherwise turn its box into an
 * uncontrolled input halfway through the form, and a wrong value would reach
 * the wire as a patch the API refuses.
 */
export function draftSanitizer<T extends object>(
  fields: DraftFields,
): DraftSanitizer<T> {
  const text = new Set(fields.text);
  return (stored, base) => {
    if (
      typeof stored !== "object" ||
      stored === null ||
      Array.isArray(stored)
    ) {
      return {};
    }
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
      const choice = declared(fields.choices, key);
      const answered = declared(fields.answered, key);
      if (text.has(key)) {
        if (typeof value === "string") kept[key] = value;
      } else if (choice) {
        if (
          value === null ||
          (typeof value === "string" && choice.includes(value))
        ) {
          kept[key] = value;
        }
      } else if (answered) {
        if (typeof value === "string" && answered.includes(value)) {
          kept[key] = value;
        }
      }
    }
    return kept as Partial<T>;
  };
}

/** What a stored value changes about the fresh draft: the sanitized keys
 *  whose value differs from the base. Empty when the value is malformed, of
 *  the wrong shape, or says nothing the record does not already say. Never
 *  throws, whatever the sanitizer does with what it is given. */
export function resumeDraft<T extends object>(
  stored: unknown,
  base: T,
  sanitize: DraftSanitizer<T>,
): Partial<T> {
  let kept: Partial<T>;
  try {
    kept = sanitize(stored, base);
  } catch {
    return {};
  }
  if (typeof kept !== "object" || kept === null) return {};
  const changes: Partial<T> = {};
  for (const key of Object.keys(kept) as (keyof T)[]) {
    if (!(key in base)) continue;
    if (draftValueDiffers(kept[key], base[key])) changes[key] = kept[key];
  }
  return changes;
}

/** Returns the parsed draft, or null when there is none, the stored value is
 *  not valid JSON, or storage cannot be read at all. Never throws: a form
 *  that cannot restore its draft should fall back to a blank one, not crash
 *  the page it is mounting into. */
export function readDraft<T>(
  account: string,
  shelter: string,
  animalId: string,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(
      draftKey(account, shelter, animalId),
    );
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Stores the draft as JSON. Quota and access errors (private browsing,
 *  storage blocked by an extension) are swallowed: losing the draft is
 *  survivable, throwing out of a form's onChange is not. */
export function writeDraft<T>(
  account: string,
  shelter: string,
  animalId: string,
  draft: T,
): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        draftKey(account, shelter, animalId),
        JSON.stringify(draft),
      );
    } catch {
      // Nothing to do: the form keeps working, it just cannot be restored
      // after a reload in this tab.
    }
  }
  notifyAll();
}

/** Removes one draft, called on save and on discard. Swallows storage
 *  errors for the same reason writeDraft does. */
export function clearDraft(
  account: string,
  shelter: string,
  animalId: string,
): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(draftKey(account, shelter, animalId));
    } catch {
      // Nothing to remove if storage cannot be reached.
    }
  }
  notifyAll();
}

/** The animal ids that have a stored draft for this exact account and
 *  shelter, for the list page to mark. Any error reading storage yields an
 *  empty set rather than a partial one. */
export function draftIds(
  account: string,
  shelter: string,
): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const storage = window.sessionStorage;
    const ids = new Set<string>();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) continue;
      const parsed = parseDraftKey(key);
      if (parsed && parsed.account === account && parsed.shelter === shelter) {
        ids.add(parsed.animalId);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** Removes every draft of this account, across every shelter, on logout so
 *  the next signed-in account in this tab never sees a stranger's unsaved
 *  edits. Keys are collected before anything is removed: removing a key
 *  while indexing storage.key(i) shifts the indices of the keys after it,
 *  which would silently skip entries. */
export function clearAccountDrafts(account: string): void {
  if (typeof window !== "undefined") {
    try {
      const storage = window.sessionStorage;
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key === null) continue;
        const parsed = parseDraftKey(key);
        if (parsed && parsed.account === account) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    } catch {
      // Storage cannot be reached, so there is nothing left to clear.
    }
  }
  notifyAll();
}

/** Notifies on every write, clear or clearAccountDrafts made through this
 *  module in this tab, and also on a "storage" event from another tab or
 *  window whose key falls under this module's prefix (or is null, which a
 *  browser sends when a tab clears storage wholesale). Returns a no-op
 *  unsubscribe when there is no window (SSR) rather than throwing, since a
 *  component may call this during a render that also runs on the server. */
export function subscribeDrafts(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PORTAL_DRAFT_PREFIX)) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
