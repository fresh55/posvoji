// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("renders no badge for an available animal", () => {
    const { container } = render(
      <StatusBadge status="available" locale="sl" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("gives an unknown status a quiet badge rather than staying silent", () => {
    render(<StatusBadge status="unknown" locale="sl" />);
    const badge = screen.getByText("status ni znan");
    expect(badge.getAttribute("data-variant")).toBe("quiet");
  });

  it("says the same thing in English", () => {
    render(<StatusBadge status="unknown" locale="en" />);
    expect(screen.getByText("status unknown")).toBeTruthy();
  });

  it("uses the overlay tone for unknown when drawn over a photo", () => {
    render(<StatusBadge status="unknown" locale="sl" overlay />);
    const badge = screen.getByText("status ni znan");
    expect(badge.getAttribute("data-variant")).toBe("overlay-quiet");
  });

  it("still marks a named status the way it always has", () => {
    render(<StatusBadge status="hold" locale="sl" />);
    const badge = screen.getByText("ni za posvojitev");
    expect(badge.getAttribute("data-variant")).toBe("quiet");
  });
});
