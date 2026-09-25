// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { Unanswered } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { UnansweredNote, useRowNotes } from "./unanswered-note";

afterEach(cleanup);

function renderNote(tally: Unanswered | undefined, locale: Locale = "sl") {
  const { container } = render(
    <I18nProvider locale={locale}>
      <UnansweredNote tally={tally} />
    </I18nProvider>,
  );
  return container.textContent;
}

describe("UnansweredNote", () => {
  it("says how many a pick leaves out and what a pick does", () => {
    expect(renderNote({ asked: 491, unanswered: 380 })).toBe(
      "Brez podatka: 380. Izbira pokaže le živali s podatkom.",
    );
  });

  // /?zavetisce=macji-dol: none of its 15 animals has an intake date, so
  // every row reads 0 and "a pick shows only animals with data" pointed at a
  // row nobody could press.
  it("says plainly that no animal has an answer when none has", () => {
    expect(renderNote({ asked: 15, unanswered: 15 })).toBe(
      "Za nobeno od teh živali ni podatka.",
    );
    expect(renderNote({ asked: 15, unanswered: 15 }, "en")).toBe(
      "None of these animals has this information.",
    );
  });

  it("stays quiet under a tenth and with nobody asked", () => {
    expect(renderNote({ asked: 491, unanswered: 8 })).toBe("");
    expect(renderNote({ asked: 0, unanswered: 0 })).toBe("");
    expect(renderNote(undefined)).toBe("");
  });
});

type Key = "a" | "b";

function RowNotes({
  keys,
  tally,
  sectionKeys,
}: {
  keys: Key[];
  tally?: Record<Key, Unanswered>;
  sectionKeys?: Key[];
}) {
  const notes = useRowNotes(keys, tally, "unansweredRow", sectionKeys);
  return (
    <p>
      <span data-testid="section">{notes.section ?? "-"}</span>
      {keys.map((key, index) => (
        <span key={key} data-testid={key}>
          {notes.at(index).description ?? "-"}
        </span>
      ))}
    </p>
  );
}

function renderRows(
  keys: Key[],
  tally?: Record<Key, Unanswered>,
  sectionKeys?: Key[],
) {
  render(
    <I18nProvider locale="sl">
      <RowNotes keys={keys} tally={tally} sectionKeys={sectionKeys} />
    </I18nProvider>,
  );
  return {
    section: screen.getByTestId("section").textContent,
    row: (key: Key) => screen.getByTestId(key).textContent,
  };
}

describe("useRowNotes", () => {
  it("says what a pick does while a pickable row leaves animals out", () => {
    const view = renderRows(["a", "b"], {
      a: { asked: 24, unanswered: 12 },
      b: { asked: 24, unanswered: 1 },
    });
    expect(view.section).toBe("hides");
    expect(view.row("a")).toBe("Brez podatka: 12");
    expect(view.row("b")).toBe("-");
  });

  // FIV and FeLV at /?vrsta=macka&zavetisce=ljubljana: no cat has a result, so
  // both rows read 0. Each keeps its own count, which is true, and the section
  // does not claim a pick would show anything.
  it("says nothing about a pick when the only noted rows have no answers", () => {
    const view = renderRows(["a", "b"], {
      a: { asked: 24, unanswered: 24 },
      b: { asked: 24, unanswered: 0 },
    });
    expect(view.section).toBe("-");
    expect(view.row("a")).toBe("Brez podatka: 24");
  });

  it("says none when no row has a single answer", () => {
    const tally = {
      a: { asked: 23, unanswered: 23 },
      b: { asked: 23, unanswered: 23 },
    };
    expect(renderRows(["a", "b"], tally).section).toBe("none");
  });

  // The sidebar keeps one dead row when every row is dead. Whether no animal
  // has an answer is a claim about the section, so it is judged over every
  // option and not over the row that happens to be drawn.
  it("judges none over every option, not the rows drawn", () => {
    const view = (b: Unanswered) =>
      renderRows(["a"], { a: { asked: 23, unanswered: 23 }, b }, ["a", "b"]);
    expect(view({ asked: 23, unanswered: 23 }).section).toBe("none");
    cleanup();
    expect(view({ asked: 23, unanswered: 2 }).section).toBe("-");
  });

  it("says nothing without a tally", () => {
    expect(renderRows(["a", "b"]).section).toBe("-");
  });
});
