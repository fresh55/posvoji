import { randomUUID } from "node:crypto";
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
import {
  isStagingFile,
  sweepStagingFiles,
  writeFileAtomic,
} from "./write-atomic";

// The name writeFileAtomic stages beside `target`, built the way it builds it.
const stagingName = (target: string) =>
  `${target}.${process.pid}-${randomUUID()}.tmp`;

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

describe("isStagingFile", () => {
  it("accepts a name writeFileAtomic would stage", () => {
    expect(isStagingFile(stagingName("latest.json"))).toBe(true);
    expect(isStagingFile(stagingName(`${"a".repeat(64)}.json`))).toBe(true);
  });

  it("rejects published names and near misses", () => {
    expect(isStagingFile("latest.json")).toBe(false);
    expect(isStagingFile(`${"a".repeat(64)}.json`)).toBe(false);
    expect(isStagingFile("foo.tmp")).toBe(false);
    expect(isStagingFile("x.123-notauuid.tmp")).toBe(false);
    expect(isStagingFile(`${stagingName("latest.json")}.json`)).toBe(false);
  });
});

describe("sweepStagingFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-sweep-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("removes a dead run's staging file and leaves everything else", () => {
    const stagingDirectory = stagingName("cards");
    writeFileSync(join(dir, stagingName("latest.json")), "half written");
    writeFileSync(join(dir, "latest.json"), "published");
    mkdirSync(join(dir, stagingDirectory));

    expect(sweepStagingFiles(dir)).toBe(1);
    expect(readdirSync(dir).sort()).toEqual(
      ["latest.json", stagingDirectory].sort(),
    );
  });

  it("reports nothing to sweep in a published directory", () => {
    writeFileSync(join(dir, "latest.json"), "published");

    expect(sweepStagingFiles(dir)).toBe(0);
    expect(readdirSync(dir)).toEqual(["latest.json"]);
  });
});
