// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { m } from "motion/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { SCROLL_BOX_MARK, scrollChildIntoViewY } from "@/lib/scroll-strip";
import { installFilterFoldSeams } from "@/test/filter-folds";
import {
  CollapsibleBody,
  FilterSectionHeader,
  type SectionCollapse,
} from "./filter-section-header";

// The fold measures its own height, and Motion restores the scroll position
// around the measurement; the shared helper stubs what jsdom lacks for both.
// A heading with a hint opens its tooltip on focus, and Radix positions it
// with an observer jsdom does not ship either.
installFilterFoldSeams();
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;

// Whether the walk reaches for the panel is asked here; what the panel then
// does is scroll-strip.test.ts's business, and jsdom lays out nothing for it.
vi.mock("@/lib/scroll-strip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scroll-strip")>()),
  scrollChildIntoViewY: vi.fn(),
}));
const broughtIntoView = vi.mocked(scrollChildIntoViewY);

beforeEach(() => {
  broughtIntoView.mockClear();
});

function collapse(
  open: boolean,
  summary: string | null = null,
  contentId = "body",
): SectionCollapse {
  return { open, onToggle: () => undefined, summary, contentId };
}

/** A section body, and optionally something mounted in it later, the way a
 *  pick mounts its ripple or a count remounts its number. */
function Body({ open, late = false }: { open: boolean; late?: boolean }) {
  return (
    <CollapsibleBody collapse={collapse(open)}>
      <span>Miren</span>
      {late ? (
        <m.span
          data-testid="late"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      ) : null}
    </CollapsibleBody>
  );
}

function body(): HTMLElement {
  const element = document.getElementById("body");
  if (!element) throw new Error("no section body in the document");
  return element;
}

describe("the fold's first render", () => {
  it("paints a section open at mount as it stands", () => {
    render(<Body open />);

    expect(body().style.height).toBe("auto");
    expect(body().style.opacity).toBe("1");
    expect(body().style.overflow).toBe("visible");
  });

  // The ripple, Doma imam's faces and the count roll are all mounts. Under a
  // presence that said initial={false}, a body open at mount wrote everything
  // mounted in it later straight to its end state, which is opacity 1 here.
  it("still runs what mounts in it later from its initial", () => {
    const { rerender } = render(<Body open />);

    rerender(<Body open late />);

    expect(screen.getByTestId("late").style.opacity).toBe("0");
  });

  it("unfolds a section opened after it", () => {
    const { rerender } = render(<Body open={false} />);

    rerender(<Body open />);

    expect(body().style.height).toBe("0px");
    expect(body().style.opacity).toBe("0");
  });

  it("unfolds the first body again once it has been folded away", async () => {
    const { rerender } = render(<Body open />);
    rerender(<Body open={false} />);
    await waitFor(() => expect(document.getElementById("body")).toBeNull(), {
      timeout: 2000,
    });

    rerender(<Body open />);

    expect(body().style.opacity).toBe("0");
  });
});

describe("the clip", () => {
  // Nothing renders the section again after its open here, which is the case
  // that kept the clip: the sidebar with its pointer gone.
  it("lets go of the body once it has finished opening", async () => {
    const { rerender } = render(<Body open={false} />);
    rerender(<Body open />);
    expect(body().style.overflow).toBe("hidden");

    await waitFor(() => expect(body().style.overflow).toBe("visible"), {
      timeout: 2000,
    });
  });
});

function Heading({ open, summary }: { open: boolean; summary: string | null }) {
  return (
    <I18nProvider locale="sl">
      <FilterSectionHeader
        label="Energija"
        active
        onReset={() => undefined}
        resetAriaLabel="Ponastavi filter energije"
        collapse={collapse(open, summary, "energy")}
      />
    </I18nProvider>
  );
}

describe("the heading's marks", () => {
  // One ternary drew both, and without keys React reused one span and
  // tweened the chip out of the dot's classes.
  it("draws the summary chip and the dot as two nodes", () => {
    const { rerender } = render(<Heading open summary={null} />);
    const trigger = screen.getByRole("button", { name: /^Energija/ });
    const dot = trigger.querySelector(".bg-brand-border");
    expect(dot).toBeTruthy();

    rerender(<Heading open={false} summary="Miren" />);
    const chip = [...trigger.querySelectorAll("span")].find(
      (span) => span.textContent === "Miren",
    );
    expect(chip).toBeTruthy();
    expect(chip).not.toBe(dot);
    expect(dot?.isConnected).toBe(false);

    rerender(<Heading open summary={null} />);
    expect(trigger.querySelector(".bg-brand-border")).not.toBe(chip);
    expect(chip?.isConnected).toBe(false);
  });

  // The classes and not a computed size: jsdom evaluates no media query.
  it("prints the folded chip a step larger below lg", () => {
    render(<Heading open={false} summary="Miren" />);
    const chip = [
      ...screen.getByRole("button", { name: /^Energija/ }).querySelectorAll("span"),
    ].find((span) => span.textContent === "Miren");
    const classes = [...(chip?.classList ?? [])];

    expect(classes).toContain("text-2xs");
    expect(classes).toContain("lg:text-3xs");
    expect(classes).not.toContain("text-3xs");
  });

  it("stops the chevron turning under reduced motion", () => {
    render(<Heading open summary={null} />);
    const chevron = screen
      .getByRole("button", { name: /^Energija/ })
      .querySelector("svg.lucide-chevron-down");

    expect(chevron?.classList.contains("motion-reduce:transition-none")).toBe(
      true,
    );
  });

  // A tap on the mark folded the section, and the text it stands for opens
  // on hover or focus. The sentence is drawn in the body on a coarse pointer.
  it("leaves the info mark out on a coarse pointer", () => {
    render(
      <I18nProvider locale="sl">
        <FilterSectionHeader
          label="Energija"
          active={false}
          collapse={collapse(true, null, "energy")}
          hint="Po presoji zavetišča."
        />
      </I18nProvider>,
    );
    const info = screen
      .getByRole("button", { name: /^Energija/ })
      .querySelector("svg.lucide-info");

    expect(info?.classList.contains("pointer-coarse:hidden")).toBe(true);
  });
});

describe("the reset link in a folding heading", () => {
  // While pressed, the shared Button nudges its translate by a pixel, and a
  // link centred by a translate lost the centring with it and dropped half its
  // height out from under the pointer. The browser measurement is in
  // e2e/filter-section-header.spec.ts; this pins what holds it.
  it("centres itself without a transform the press would replace", () => {
    render(<Heading open summary={null} />);
    const classes = [
      ...screen.getByRole("button", { name: "Ponastavi filter energije" })
        .classList,
    ];

    expect(classes).toEqual(
      expect.arrayContaining(["absolute", "inset-y-0", "my-auto", "h-fit"]),
    );
    expect(classes).not.toContain("top-1/2");
    expect(classes.filter((name) => name.includes("translate"))).toEqual([
      "active:not-aria-[haspopup]:translate-y-px",
    ]);
  });
});

/** A section whose reset empties it, with a row after its header. */
function Resettable({ folds }: { folds: boolean }) {
  const [active, setActive] = useState(true);
  return (
    <I18nProvider locale="sl">
      <section>
        <FilterSectionHeader
          label="Energija"
          active={active}
          onReset={() => setActive(false)}
          resetAriaLabel="Ponastavi filter energije"
          collapse={folds ? collapse(true, null, "energy") : undefined}
        />
        <button type="button">Miren</button>
      </section>
    </I18nProvider>
  );
}

describe("focus after a reset", () => {
  // A click the keyboard made carries detail 0. The reset goes inert in the
  // render that press causes and cannot keep focus.
  it("hands a keyboard reset's focus to the section's heading", () => {
    render(<Resettable folds />);
    const reset = screen.getByRole("button", { name: "Ponastavi filter energije" });
    reset.focus();

    fireEvent.click(reset, { detail: 0 });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Energija/ }),
    );
    expect(reset.hasAttribute("inert")).toBe(true);
  });

  it("hands it to the first control where the heading does not fold", () => {
    render(<Resettable folds={false} />);
    const reset = screen.getByRole("button", { name: "Ponastavi filter energije" });
    reset.focus();

    fireEvent.click(reset, { detail: 0 });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Miren" }),
    );
  });

  it("leaves focus where a pointer press found it", () => {
    render(<Resettable folds />);
    const reset = screen.getByRole("button", { name: "Ponastavi filter energije" });
    reset.focus();

    fireEvent.click(reset, { detail: 1 });

    expect(document.activeElement).toBe(reset);
  });
});

function Panel() {
  return (
    <I18nProvider locale="sl">
      <aside {...{ [SCROLL_BOX_MARK]: "" }}>
        <section>
          <FilterSectionHeader
            label="Spol"
            active={false}
            collapse={collapse(true, null, "sex")}
          />
        </section>
        <section>
          <FilterSectionHeader
            label="Starost"
            active={false}
            collapse={collapse(false, null, "age")}
          />
        </section>
      </aside>
    </I18nProvider>
  );
}

describe("the arrow-key walk", () => {
  // A plain focus() scrolls every box it must, the window included: from the
  // top of the page at 1440x900 the walk threw the window 480px.
  it("moves focus without scrolling and brings the section into the panel", () => {
    render(<Panel />);
    const sex = screen.getByRole("button", { name: /^Spol/ });
    const age = screen.getByRole("button", { name: /^Starost/ });
    const focus = vi.spyOn(age, "focus");
    sex.focus();

    fireEvent.keyDown(sex, { key: "ArrowDown" });

    expect(document.activeElement).toBe(age);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(broughtIntoView).toHaveBeenCalledWith(age.closest("section"));
    // And the heading's own box last, which stands past its section's.
    expect(broughtIntoView).toHaveBeenLastCalledWith(age);
  });
});
