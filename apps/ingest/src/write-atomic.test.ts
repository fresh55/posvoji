import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./write-atomic";

describe("writeFileAtomic", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-atomic-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("replaces a file without leaving its temporary sibling", () => {
    const path = join(dir, "manifest.json");
    writeFileAtomic(path, "first");
    writeFileAtomic(path, "second");

    expect(readFileSync(path, "utf8")).toBe("second");
    expect(readdirSync(dir)).toEqual(["manifest.json"]);
  });

  it("atomically replaces binary output", () => {
    const path = join(dir, "card.jpg");
    writeFileAtomic(path, Buffer.from([0xff, 0xd8, 0x00]));
    writeFileAtomic(path, Buffer.from([0xff, 0xd8, 0x01, 0xff, 0xd9]));

    expect(readFileSync(path)).toEqual(
      Buffer.from([0xff, 0xd8, 0x01, 0xff, 0xd9]),
    );
    expect(readdirSync(dir)).toEqual(["card.jpg"]);
  });

  it("does not reuse another writer's staging sibling", () => {
    const path = join(dir, "manifest.json");
    const occupiedTemp = `${path}.tmp`;
    writeFileSync(occupiedTemp, "other writer");

    writeFileAtomic(path, "ours");

    expect(readFileSync(path, "utf8")).toBe("ours");
    expect(readFileSync(occupiedTemp, "utf8")).toBe("other writer");
  });

  it("cleans its temporary sibling when the rename fails", () => {
    const path = join(dir, "occupied");
    mkdirSync(path);

    expect(() => writeFileAtomic(path, "not a directory")).toThrow();
    expect(readdirSync(dir)).toEqual(["occupied"]);
  });
});
