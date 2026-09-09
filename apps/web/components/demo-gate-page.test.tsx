// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatModelHandle } from "./cat-model";
import { DemoGatePage } from "./demo-gate-page";

let handOver: ((handle: CatModelHandle | null) => void) | undefined;
vi.mock("./cat-model", () => ({
  CatModel: ({ onHandle }: { onHandle?: (handle: CatModelHandle | null) => void }) => {
    handOver = onHandle;
    return <div data-testid="cat" />;
  },
}));

const reload = vi.fn();
const assign = vi.fn();
let pathname = "/";

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockReset();
  assign.mockReset();
  document.cookie = "posvoji_demo=; Path=/; Max-Age=0";
  vi.stubGlobal("location", { get pathname() { return pathname; }, protocol: "http:", reload, assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  handOver = undefined;
});

const cookie = () => document.cookie;

describe("DemoGatePage", () => {
  it("stores the password in the cookie and reloads the refused address", () => {
    pathname = "/zival/abc";
    render(<DemoGatePage locale="sl" />);
    expect(screen.getByRole("heading", { name: "Dostop za zavetišča" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Geslo iz povabila"), { target: { value: " tajno " } });
    fireEvent.click(screen.getByRole("button", { name: "Vstopi" }));
    expect(cookie()).toContain("posvoji_demo=tajno");
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("goes to the home page from the gate's own address", () => {
    pathname = "/en/enter";
    render(<DemoGatePage locale="en" />);
    fireEvent.change(screen.getByLabelText("Password from your invitation"), { target: { value: "secret" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enter" }).closest("form")!);
    expect(assign).toHaveBeenCalledWith("/en");
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows the typed password on request", () => {
    pathname = "/";
    render(<DemoGatePage locale="sl" />);
    const field = screen.getByLabelText("Geslo iz povabila");
    expect(field.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Pokaži geslo" }));
    expect(field.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Skrij geslo" })).toBeTruthy();
  });

  it("refuses an empty password without leaving", () => {
    pathname = "/";
    render(<DemoGatePage locale="sl" />);
    fireEvent.click(screen.getByRole("button", { name: "Vstopi" }));
    expect(screen.getByRole("alert").textContent).toBe("Vnesite geslo.");
    expect(reload).not.toHaveBeenCalled();
    expect(cookie()).not.toContain("posvoji_demo=");
  });

  it("reads a still-set cookie at a refused address as a wrong password", () => {
    pathname = "/";
    document.cookie = "posvoji_demo=napak; Path=/";
    render(<DemoGatePage locale="sl" />);
    expect(screen.getByRole("alert").textContent).toBe("Geslo ni pravilno.");
    expect(screen.getByLabelText("Geslo iz povabila").getAttribute("aria-invalid")).toBe("true");
    expect(cookie()).not.toContain("posvoji_demo=");
  });

  it("does not read the cookie as wrong on the gate's own address", () => {
    pathname = "/vstop";
    document.cookie = "posvoji_demo=pravilno; Path=/";
    render(<DemoGatePage locale="sl" />);
    expect(screen.queryByRole("alert")?.textContent).toBe("");
    expect(cookie()).toContain("posvoji_demo=pravilno");
  });

  it("lets the cat greet before turning the page over", () => {
    pathname = "/";
    render(<DemoGatePage locale="sl" />);
    const react = vi.fn(() => true);
    act(() => handOver?.({ react }));
    fireEvent.change(screen.getByLabelText("Geslo iz povabila"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Vstopi" }));
    expect(react).toHaveBeenCalledWith("Paw hello");
    expect(reload).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(900); });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("asks the cat to object to a wrong password", () => {
    pathname = "/";
    document.cookie = "posvoji_demo=napak; Path=/";
    const react = vi.fn(() => true);
    render(<DemoGatePage locale="sl" />);
    act(() => handOver?.({ react }));
    // The handle arrives after the model loads, which is after the error is
    // already known; the objection is not lost for that.
    expect(react).toHaveBeenCalledWith("Back warning");
  });
});
