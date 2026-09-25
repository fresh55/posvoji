// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { m } from "motion/react";
import { describe, expect, it } from "vitest";
import { installFilterFoldSeams } from "@/test/filter-folds";
import { CollapsibleBody, type SectionCollapse } from "./filter-section-header";

// The fold measures its own height, and Motion restores the scroll position
// around the measurement; the shared helper stubs what jsdom lacks for both.
installFilterFoldSeams();

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
