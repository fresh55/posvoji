// Property tests for the scalar parsers that read shelter pages. Shelter HTML
// is untrusted input, so for any text a parser must return a value the schema
// accepts, or undefined, and never throw. Well-formed input must round-trip.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "@posvoji/provider-sdk";
import * as horjul from "@posvoji/provider-horjul";
import * as ljubljana from "@posvoji/provider-ljubljana";
import * as macjaHisa from "@posvoji/provider-macja-hisa";
import * as macjiDol from "@posvoji/provider-macji-dol";
import * as malaHisa from "@posvoji/provider-mala-hisa";
import * as maribor from "@posvoji/provider-maribor";
import * as meli from "@posvoji/provider-meli";
import * as muri from "@posvoji/provider-muri";
import * as obalno from "@posvoji/provider-obalno";
import * as turk from "@posvoji/provider-turk";
import * as zonzani from "@posvoji/provider-zonzani";
import {
  AdoptionStatus,
  Animal,
  AnimalMedical,
  AnimalSize,
  Compatibility,
  EnergyLevel,
  LifeStage,
  Sex,
} from "@posvoji/schema";
import type { z } from "zod";

// Words and marks the parsers branch on, so generated text reaches past the
// first regex instead of failing it every time.
const TOKENS = [
  " ", ".", ",", "/", "-", "–", "(", ")", ":", "\n", " ",
  "let", "leta", "leti", "leto", "mesec", "meseca", "mesece", "mesecev",
  "tednov", "in", "pol", "manj kot", "okoli", "cca", "starost",
  "samec", "samica", "pes", "psička", "mačka", "maček", "kastriran",
  "rezervirana", "rezerviran", "posvojen", "karantena", "na voljo",
  "majhen", "srednji", "velik", "miren", "živahen", "ok", "da", "ne",
  "sprejeta v zavetišče", "cepljen", "čipiran", "GMT", "Mon,", "Jan",
];

const shelterText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 60 }),
  fc
    .array(
      fc.oneof(
        fc.constantFrom(...TOKENS),
        fc.nat({ max: 3000 }).map(String),
        // Past Number.MAX_SAFE_INTEGER once multiplied into months.
        fc.bigInt({ min: 0n, max: 10n ** 18n }).map(String),
        fc.string({ maxLength: 3 }),
      ),
      { maxLength: 14 },
    )
    .map((parts) => parts.join("")),
);

const calendarDate = fc.date({
  min: new Date("1990-01-01T00:00:00Z"),
  max: new Date("2099-12-31T00:00:00Z"),
  noInvalidDate: true,
});

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayMonthYear(date: Date) {
  return {
    d: date.getUTCDate(),
    m: date.getUTCMonth() + 1,
    y: date.getUTCFullYear(),
  };
}

function acceptsAnyText(
  parse: (value: string) => unknown,
  schema: z.ZodType,
) {
  fc.assert(
    fc.property(shelterText, (value) => {
      expect(schema.safeParse(parse(value)).success).toBe(true);
    }),
  );
}

const isoDate = Animal.shape.intakeDate;
const ageMonths = Animal.shape.approximateAgeMonths;

describe("date parsers", () => {
  const slovenian = {
    horjul: horjul.parseSlovenianDate,
    "macja-hisa": macjaHisa.parseSlovenianDate,
    maribor: maribor.parseSlovenianDate,
    muri: muri.parseSlovenianDate,
    zonzani: zonzani.parseSlovenianDate,
  };

  for (const [name, parse] of Object.entries(slovenian)) {
    it(`${name} returns a real calendar date or nothing`, () => {
      acceptsAnyText(parse, isoDate);
    });

    it(`${name} reads "d. m. yyyy" and "dd.mm.yyyy" back to the same day`, () => {
      fc.assert(
        fc.property(calendarDate, (date) => {
          const { d, m, y } = dayMonthYear(date);
          const pad = (n: number) => String(n).padStart(2, "0");
          expect(parse(`${d}. ${m}. ${y}`)).toBe(isoDay(date));
          expect(parse(`${pad(d)}.${pad(m)}.${y}`)).toBe(isoDay(date));
        }),
      );
    });
  }

  it("macji-dol finds the intake date in prose", () => {
    acceptsAnyText(macjiDol.parseIntakeDate, isoDate);
    fc.assert(
      fc.property(calendarDate, (date) => {
        const { d, m, y } = dayMonthYear(date);
        expect(macjiDol.parseIntakeDate(`Sprejeta v zavetišče ${d}. ${m}. ${y}.`))
          .toBe(isoDay(date));
      }),
    );
  });

  it("obalno reads d/m/yyyy", () => {
    acceptsAnyText(obalno.parseSlashDate, isoDate);
    fc.assert(
      fc.property(calendarDate, (date) => {
        const { d, m, y } = dayMonthYear(date);
        expect(obalno.parseSlashDate(`${d}/${m}/${y}`)).toBe(isoDay(date));
      }),
    );
  });

  it("ljubljana reads the UTC CMS timestamp as its Ljubljana day", () => {
    acceptsAnyText(ljubljana.parseCmsDate, isoDate);
    const ljubljanaDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Ljubljana",
    });
    fc.assert(
      fc.property(calendarDate, (date) => {
        const stamp = date.toISOString().slice(0, 19).replace("T", " ");
        expect(ljubljana.parseCmsDate(stamp)).toBe(ljubljanaDay.format(date));
      }),
    );
  });

  it("ljubljana rejects timestamps that are not a real time", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    fc.assert(
      fc.property(
        // One past each edge, so both real and impossible times come up often.
        fc.integer({ min: 1990, max: 2099 }),
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 0, max: 32 }),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        (y, m, d, h, min, s) => {
          const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const real =
            m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth &&
            h < 24 && min < 60 && s < 60;
          const stamp = `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(min)}:${pad(s)}`;
          expect(ljubljana.parseCmsDate(stamp) === undefined).toBe(!real);
        },
      ),
    );
  });
});

describe("age parsers return whole, non-negative months or nothing", () => {
  const parsers = {
    horjul: horjul.parseAgeMonths,
    "macja-hisa": macjaHisa.parseAgeMonths,
    "mala-hisa": malaHisa.parseApproximateAgeMonths,
    maribor: maribor.parseApproximateAgeMonths,
    meli: meli.parseApproximateAgeMonths,
    muri: muri.parseAgeMonths,
    turk: turk.parseApproximateAgeMonths,
    zonzani: zonzani.parseAgeMonths,
  };

  // A crawled page is untrusted, so a long blank run must not make a regex
  // backtrack quadratically. 100 000 blanks took seconds before the fix.
  const blanks = " ".repeat(100_000);
  const blankRuns = [`1${blanks}x`, `1-2${blanks}x`, `1${blanks}-x`];

  for (const [name, parse] of Object.entries(parsers)) {
    it(name, () => {
      acceptsAnyText(parse, ageMonths);
    });

    it(`${name} stays fast on long blank runs`, () => {
      for (const input of blankRuns) {
        const start = performance.now();
        parse(input);
        expect(performance.now() - start).toBeLessThan(500);
      }
    });
  }
});

describe("value parsers stay inside the schema", () => {
  const cases: [string, (value: string) => unknown, z.ZodType][] = [
    ["horjul status", horjul.parseStatus, AdoptionStatus],
    ["zonzani status", zonzani.parseStatus, AdoptionStatus],
    ["meli sex", meli.parseSex, Sex.optional()],
    ["turk sex", turk.parseSex, Sex.optional()],
    ["turk size", turk.parseSize, AnimalSize.optional()],
    ["turk medical", turk.parseMedical, AnimalMedical.optional()],
    ["muri energy", muri.parseEnergy, EnergyLevel.optional()],
    ["muri compatibility", muri.parseCompatibility, Compatibility.optional()],
    ["mala-hisa life stage", malaHisa.parseRangeLifeStage, LifeStage.optional()],
    ["horjul veterinary care", horjul.parseVeterinaryCare, AnimalMedical.partial()],
  ];

  for (const [name, parse, schema] of cases) {
    it(name, () => {
      acceptsAnyText(parse, schema);
    });
  }
});

describe("parseRetryAfter", () => {
  const now = Date.UTC(2026, 8, 25, 12);

  it("returns a non-negative whole delay or nothing for any header", () => {
    fc.assert(
      fc.property(shelterText, (header) => {
        const delay = parseRetryAfter(header, now);
        if (delay !== undefined) {
          expect(Number.isSafeInteger(delay)).toBe(true);
          expect(delay).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("reads delta-seconds", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000_000 }), (seconds) => {
        expect(parseRetryAfter(String(seconds), now)).toBe(seconds * 1_000);
      }),
    );
  });

  it("reads an IMF-fixdate as the time left until it", () => {
    fc.assert(
      fc.property(calendarDate, (date) => {
        const at = Math.floor(date.getTime() / 1_000) * 1_000;
        expect(parseRetryAfter(new Date(at).toUTCString(), now))
          .toBe(Math.max(0, at - now));
      }),
    );
  });
});
