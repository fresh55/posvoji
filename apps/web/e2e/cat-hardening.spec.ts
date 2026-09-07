import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ModelViewerElement } from "@google/model-viewer";

async function load(page: Page) {
  await page.goto("/o-nas");
  const model = page.locator("model-viewer");
  await model.scrollIntoViewIfNeeded();
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).loaded)).toBe(true);
  return model;
}
async function clip(model: Locator, name: string) {
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).animationName)).toBe(name);
}
async function headPoint(model: Locator) {
  return model.evaluate(e => {
    const v = e as ModelViewerElement, r = v.getBoundingClientRect();
    for (let y = .3; y < .58; y += .04) for (let x = .3; x < .72; x += .04) {
      const px = r.x + r.width * x, py = r.y + r.height * y;
      if (v.materialFromPoint(px, py)?.name === "Head touch region") return { x: px, y: py };
    }
    throw new Error("The animated head touch region must be pickable");
  });
}

test("anatomical taps use one pick and rapid repeats finish before returning to idle", async ({ page, isMobile }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const model = await load(page);
  await model.evaluate(e => { (e as ModelViewerElement).currentTime = 0; });
  const p = await headPoint(model);
  await model.evaluate(e => {
    const v = e as ModelViewerElement;
    const material = v.materialFromPoint.bind(v), position = v.positionAndNormalFromPoint.bind(v);
    e.setAttribute("data-picks", "0"); e.setAttribute("data-position-picks", "0");
    v.materialFromPoint = (...args) => { e.setAttribute("data-picks", String(Number(e.getAttribute("data-picks")) + 1)); return material(...args); };
    v.positionAndNormalFromPoint = (...args) => { e.setAttribute("data-position-picks", String(Number(e.getAttribute("data-position-picks")) + 1)); return position(...args); };
  });
  if (isMobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await clip(model, "Head pet");
  await expect(model).toHaveAttribute("data-picks", "1");
  await expect(model).toHaveAttribute("data-position-picks", "0");
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(.3);
  // Read and dispatch in one browser task: automation round trips on a slower
  // browser can otherwise straddle a legitimate completed-loop replay.
  const times = await model.evaluate(e => {
    const before = (e as ModelViewerElement).currentTime;
    for (let i = 0; i < 8; i++) e.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    return { before, after: (e as ModelViewerElement).currentTime };
  });
  expect(times.after).toBe(times.before);
  await clip(model, "Companion");
  expect(errors).toEqual([]);
});

test("immediate drags do no picks; cancelled holds and multiple contacts restore camera controls", async ({ page }) => {
  const model = await load(page);
  await model.evaluate(e => { (e as ModelViewerElement).currentTime = 0; });
  const p = await headPoint(model);
  const result = await model.evaluate(async (e, p) => {
    const v = e as ModelViewerElement; let picks = 0; const original = v.materialFromPoint.bind(v);
    v.materialFromPoint = (...args) => { picks++; return original(...args); };
    const fire = (type: string, id = 1, x = p.x) => e.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: p.y }));
    fire("pointerdown"); fire("pointermove", 1, p.x + 50); fire("pointerup", 1, p.x + 50);
    const dragPicks = picks;
    fire("pointerdown"); await new Promise(r => setTimeout(r, 500)); const reserved = !v.cameraControls;
    fire("pointercancel"); const recovered = v.cameraControls;
    fire("pointerdown"); fire("pointerdown", 2); fire("pointerup", 2); fire("pointerup");
    v.materialFromPoint = original;
    return { dragPicks, reserved, recovered, clip: v.animationName };
  }, p);
  expect(result).toEqual({ dragPicks: 0, reserved: true, recovered: true, clip: "Companion" });
});

test("offscreen pauses preserve a reaction and clear its queued follow-up", async ({ page }) => {
  const model = await load(page);
  await model.evaluate(e => { (e as ModelViewerElement).currentTime = 0; e.dispatchEvent(new KeyboardEvent("keydown", { key: "h" })); });
  await clip(model, "Head pet");
  await model.evaluate(e => e.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })));
  await model.evaluate(e => { (e.parentElement as HTMLElement).style.visibility = "hidden"; e.parentElement!.style.transform = "translateY(10000px)"; });
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(true);
  const t = await model.evaluate(e => (e as ModelViewerElement).currentTime);
  await page.waitForTimeout(250);
  expect(await model.evaluate(e => (e as ModelViewerElement).currentTime)).toBe(t);
  await model.evaluate(e => { e.parentElement!.style.visibility = ""; e.parentElement!.style.transform = ""; });
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(false);
  await clip(model, "Companion");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(true);
  await model.evaluate(e => e.dispatchEvent(new KeyboardEvent("keydown", { key: "b" })));
  await clip(model, "Companion");
});

test("sleep and a queued wake survive visibility changes", async ({ page }) => {
  await page.clock.install();
  const model = await load(page);
  // Advance only wall-clock timers to avoid a 45-second wait per engine.
  // The real-time chain is also measured by the recorded runtime audit.
  await page.clock.fastForward(46000);
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).animationName)).toMatch(/^(Drowse|Sleep)$/);
  await page.clock.runFor(300);
  await model.evaluate(async e => { const v = e as ModelViewerElement; await v.updateComplete; if (v.animationName === "Drowse") v.currentTime = v.duration; });
  await page.clock.runFor(300);
  await clip(model, "Sleep");
  await model.evaluate(e => { e.parentElement!.style.transform = "translateY(10000px)"; });
  await page.clock.runFor(200);
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(true);
  await model.evaluate(e => { e.parentElement!.style.transform = ""; });
  await page.clock.runFor(200);
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(false);
  await model.evaluate(e => e.dispatchEvent(new KeyboardEvent("keydown", { key: "h" })));
  await clip(model, "Wake");
  await page.clock.runFor(300);
  await model.evaluate(async e => { const v = e as ModelViewerElement; await v.updateComplete; v.currentTime = v.duration; });
  await page.clock.runFor(300);
  await clip(model, "Head pet");
});
