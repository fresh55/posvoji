import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Animal } from "@posvoji/schema";

// What a removal means: the provider no longer lists the animal on this run.
// It is a "no longer listed" fact, not an outcome. It is never a claim that
// the animal was adopted, and downstream UI must not read a removal as
// "posvojen": only the shelter's own status field can say that.
export interface RemovedAnimal {
  id: string;
  providerId: string;
  name?: string;
  species: Animal["species"];
  intakeDate?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export function toRemovedAnimal(animal: Animal): RemovedAnimal {
  return {
    id: animal.id,
    providerId: animal.source.providerId,
    name: animal.name,
    species: animal.species,
    intakeDate: animal.intakeDate,
    firstSeenAt: animal.source.firstSeenAt,
    lastSeenAt: animal.source.lastSeenAt,
  };
}

// One line per export run: the durable history that data/dist/changes.json
// does not keep, because that file is overwritten every run. Kept minimal on
// purpose - the full removed record (not just an id), the added ids, and a
// count for updates, which nobody has needed to look up by id so far.
export interface HistoryEntry {
  generatedAt: string;
  added: string[];
  updatedCount: number;
  removed: RemovedAnimal[];
}

export function isEmptyHistoryEntry(entry: HistoryEntry): boolean {
  return (
    entry.added.length === 0 &&
    entry.updatedCount === 0 &&
    entry.removed.length === 0
  );
}

// Appends one JSON line to the ledger at `path`, creating the file and its
// directory if missing. Never truncates or rewrites earlier lines: that is
// the entire point of keeping this file outside data/dist, which export.ts
// regenerates wholesale on every run (see paths.ts). A run with no changes at
// all is skipped so a hand rerun against an unchanged crawl does not spam the
// ledger with identical lines.
export function appendHistoryEntry(path: string, entry: HistoryEntry): void {
  if (isEmptyHistoryEntry(entry)) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}
