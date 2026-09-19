import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ModelViewerElement } from "@google/model-viewer";

/** The box the poster and the viewer share, the cat's only handle in the DOM. */
function stage(page: Page) {
  return page.locator('img[src*="/models/our-cat/poster.webp"]').locator("..");
}
async function load(page: Page) {
  await page.goto("/o-nas");
  // The viewer does not exist until its stage enters the viewport on phones.
  await stage(page).scrollIntoViewIfNeeded();
  const model = page.locator("model-viewer");
  await model.scrollIntoViewIfNeeded();
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).loaded)).toBe(true);
  await expect(model.locator("..")).toHaveAttribute("aria-hidden", "false");
  return model;
}
async function clip(model: Locator, name: string) {
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).animationName)).toBe(name);
}
async function headPoint(model: Locator) {
  return model.evaluate(async e => {
    const v = e as ModelViewerElement, r = v.getBoundingClientRect();
    // Keep the selected anatomical point under the pointer while automation
    // returns to the browser. A tap resumes playback through the controller.
    v.pause(); v.currentTime = 0; await v.updateComplete;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let y = .3; y < .58; y += .04) for (let x = .3; x < .72; x += .04) {
      const px = r.x + r.width * x, py = r.y + r.height * y;
      if (v.materialFromPoint(px, py)?.name === "Head touch region") return { x: px, y: py };
    }
    throw new Error("The animated head touch region must be pickable");
  });
}

test("a freshly loaded cat starts moving without a tap or a manual seek", async ({ page }) => {
  const model = await load(page);
  const initial = await model.evaluate(e => (e as ModelViewerElement).currentTime);
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(initial + .5);
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(false);
});

test("the stage says he is loading until he can be touched, and he answers a touch made meanwhile", async ({ page, isMobile }) => {
  // Hold the model back, so the wait is observable on a fast machine.
  await page.route("**/models/our-cat/cat.glb*", async route => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.goto("/vstop");
  const poster = stage(page);
  const status = page.locator('[data-slot="cat-status"]');
  const opacity = () => status.evaluate(e => getComputedStyle(e).opacity);
  await expect(status).toHaveText(/še nalaga/);
  await expect(poster).toHaveCSS("cursor", "progress");
  // Nothing is drawn for a visitor who has not reached for him.
  expect(await opacity()).toBe("0");
  const box = (await poster.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await expect.poll(opacity).toBe("1");
  const model = page.locator("model-viewer");
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).loaded), { timeout: 30_000 }).toBe(true);
  await clip(model, "Notice");
  await expect(status).toHaveText("");
  await expect.poll(opacity).toBe("0");
  await expect(poster).not.toHaveCSS("cursor", "progress");
});

test("the still stays under the reveal and the remembered greeting waits for it", async ({ page, isMobile }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/models/our-cat/cat.glb*", async route => {
    await held;
    await route.continue();
  });
  try {
    await page.goto("/vstop");
    const model = page.locator("model-viewer");
    await model.waitFor({ state: "attached" });
    await model.evaluate(e => {
      const viewer = e as ModelViewerElement;
      const host = e.parentElement!;
      const poster = host.parentElement!.querySelector("img")!;
      const frames: { opacity: number; still: boolean; paused: boolean }[] = [];
      e.addEventListener("load", () => {
        const sample = () => {
          const opacity = Number(getComputedStyle(host).opacity);
          const still = getComputedStyle(poster).visibility !== "hidden";
          frames.push({ opacity, still, paused: viewer.paused });
          if (!still) e.setAttribute("data-reveal-frames", JSON.stringify(frames));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, { once: true });
    });
    const box = (await stage(page).boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    release();
    await expect(model).toHaveAttribute("data-reveal-frames", /.+/);
    const frames = JSON.parse((await model.getAttribute("data-reveal-frames"))!) as
      { opacity: number; still: boolean; paused: boolean }[];
    expect(frames.some(frame => frame.still && frame.opacity < 1)).toBe(true);
    expect(frames.every(frame => frame.still || frame.opacity === 1)).toBe(true);
    expect(frames.filter(frame => frame.still).every(frame => frame.paused)).toBe(true);
    await clip(model, "Notice");
  } finally {
    release();
  }
});

test("hiding the stage mid-fade cancels the reveal without stranding it", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/models/our-cat/cat.glb*", async route => {
    await held;
    await route.continue();
  });
  try {
    await page.goto("/vstop");
    const model = page.locator("model-viewer");
    await model.waitFor({ state: "attached" });
    await model.evaluate(e => {
      const host = e.parentElement!;
      host.addEventListener("transitionstart", event => {
        if (event.target !== host || event.propertyName !== "opacity") return;
        // Hide after the one-off rAF fallback has already checked the fade.
        setTimeout(() => { host.parentElement!.style.display = "none"; }, 100);
      }, { once: true });
      host.addEventListener("transitioncancel", event => {
        if (event.target === host && event.propertyName === "opacity") {
          host.setAttribute("data-reveal-cancelled", "true");
        }
      }, { once: true });
    });
    release();
    const host = model.locator("..");
    await expect(host).toHaveAttribute("data-reveal-cancelled", "true");
    await expect(host).toHaveAttribute("aria-hidden", "false");
    await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).paused)).toBe(true);
    await model.evaluate(e => { e.parentElement!.parentElement!.style.display = ""; });
    await expect(model).toBeVisible();
    await expect(page.locator('[data-slot="cat-status"]')).toHaveText("");
    await expect(stage(page)).not.toHaveCSS("cursor", "progress");
    const initial = await model.evaluate(e => (e as ModelViewerElement).currentTime);
    await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(initial + .5);
  } finally {
    release();
  }
});

test("a failed download retries on the next touch without extra controls", async ({ page, isMobile }) => {
  const attempts: string[] = [];
  await page.route("**/models/our-cat/cat.glb*", async route => {
    attempts.push(route.request().url());
    if (!new URL(route.request().url()).searchParams.has("retry")) {
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
    } else await route.continue();
  });
  await page.goto("/vstop");
  const status = page.locator('[data-slot="cat-status"]');
  await expect(status).toHaveText(/Dotakni se ga za nov poskus/);
  await expect(page.locator("model-viewer")).toHaveCount(0);
  const buttonsBefore = await page.getByRole("button").count();
  const box = (await stage(page).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  const model = page.locator("model-viewer");
  await expect(model).toHaveCount(1);
  await expect(model.locator("..")).toHaveAttribute("aria-hidden", "false");
  await expect(status).toHaveText("");
  await clip(model, "Notice");
  expect(attempts.some(url => new URL(url).searchParams.get("retry") === "1")).toBe(true);
  expect(await page.getByRole("button").count()).toBe(buttonsBefore);
});

test("anatomical taps use the proxy instead of the full mesh and rapid repeats finish before returning to idle", async ({ page, isMobile }) => {
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
  await expect(model).toHaveAttribute("data-picks", "0");
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

test("a held head stroke gives a cheek rub and settles into a quiet seated pose", async ({ page }) => {
  const model = await load(page);
  const p = await headPoint(model);
  await model.evaluate(async (e, p) => {
    const fire = (type: string, x: number) => e.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: "touch", button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: x, clientY: p.y,
    }));
    fire("pointerdown", p.x);
    await new Promise(resolve => setTimeout(resolve, 500));
    fire("pointermove", p.x + 15);
    fire("pointerup", p.x + 15);
  }, p);
  await clip(model, "Head rub");
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(.3);
  await clip(model, "Companion");
  expect(await model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeLessThan(2);
  expect(await model.evaluate(e => (e as ModelViewerElement).cameraControls)).toBe(true);
});

test("one nose tap recoils and sniffs while a neighbouring forehead tap stays affectionate", async ({ page, isMobile }) => {
  const model = await load(page);
  const p = await model.evaluate(async e => {
    const v = e as ModelViewerElement;
    v.pause(); v.currentTime = 0; await v.updateComplete;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r = v.getBoundingClientRect();
    let best = { x: 0, y: 0, distance: Infinity };
    // Locate the visible nose surface using the public full-resolution pick.
    for (let y = .35; y <= .42; y += .01) for (let x = .47; x <= .6; x += .01) {
      const px = r.x + r.width * x, py = r.y + r.height * y;
      const point = v.positionAndNormalFromPoint(px, py)?.position;
      if (!point) continue;
      const distance = Math.hypot(point.x + .07275, point.y - .37463, point.z - .28767);
      if (distance < best.distance) best = { x: px, y: py, distance };
    }
    if (best.distance > .012) throw new Error(`Nose was not found: ${best.distance}`);
    return best;
  });
  if (isMobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await clip(model, "Nose sniff");
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(.3);
  await clip(model, "Companion");
  expect(await model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeLessThan(2);
  const head = await headPoint(model);
  if (isMobile) await page.touchscreen.tap(head.x, head.y); else await page.mouse.click(head.x, head.y);
  await clip(model, "Head pet");
});

test("one native tap on each leg withdraws that paw and settles without another gesture", async ({ page, isMobile }) => {
  const model = await load(page);
  for (const [leg, target, orbit] of [
    ["front left", [-.028, .037, .086], "-19deg 81deg 1.45m"],
    ["front right", [-.107, .037, .069], "-19deg 81deg 1.45m"],
    ["rear left", [.04, .085, -.065], "65deg 81deg 1.45m"],
    ["rear right", [-.185, .085, -.065], "-65deg 81deg 1.45m"],
  ] as const) {
    const point = await model.evaluate(async (e, { target, orbit }) => {
      const v = e as ModelViewerElement;
      v.pause(); v.currentTime = 0; v.cameraOrbit = orbit; v.jumpCameraToGoal();
      await v.updateComplete;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const r = v.getBoundingClientRect();
      let best = { x: 0, y: 0, distance: Infinity };
      // Use the public full-resolution surface to locate the resting paw/thigh;
      // the native tap itself must be classified by the independent fast picker.
      for (let y = .62; y < .88; y += .025) for (let x = .24; x < .76; x += .025) {
        const px = r.x + r.width * x, py = r.y + r.height * y;
        const hit = v.positionAndNormalFromPoint(px, py)?.position;
        if (!hit) continue;
        const distance = Math.hypot(hit.x - target[0], hit.y - target[1], hit.z - target[2]);
        if (distance < best.distance) best = { x: px, y: py, distance };
      }
      if (best.distance > .045) throw new Error(`Leg is not visible at ${orbit}: ${best.distance}`);
      return best;
    }, { target, orbit });
    if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    await clip(model, `Paw withdraw ${leg}`);
    await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(.3);
    await clip(model, "Companion");
    expect(await model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeLessThan(2);
  }
});

test("the upper flank responds as back skin instead of an unlabelled body touch", async ({ page }, info) => {
  test.skip(info.project.name !== "cat-desktop", "Fixed desktop projection; other projects exercise rotated back taps.");
  const model = await load(page);
  const point = await model.evaluate(async e => {
    const v = e as ModelViewerElement;
    v.pause(); v.currentTime = 0; v.cameraOrbit = "-65deg 81deg 1.45m"; v.jumpCameraToGoal();
    await v.updateComplete;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r = v.getBoundingClientRect();
    // A reviewed upper-flank point that the old narrow strip labelled as body.
    return { x: r.x + r.width * .338, y: r.y + r.height * .575 };
  });
  const material = await model.evaluate((e, p) => (e as ModelViewerElement).materialFromPoint(p.x, p.y)?.name, point);
  expect(material).toBe("Back touch region");
  await page.mouse.click(point.x, point.y);
  await clip(model, "Back warning");
});

test("the first rotated back tap plays the strong response and repeats finish before settling", async ({ page, isMobile }) => {
  const model = await load(page);
  const point = await model.evaluate(async e => {
    const v = e as ModelViewerElement;
    v.pause(); v.currentTime = 0; v.cameraOrbit = "145deg 75deg 1.45m"; v.jumpCameraToGoal();
    await v.updateComplete;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r = v.getBoundingClientRect();
    for (let y = .4; y < .7; y += .035) for (let x = .3; x < .75; x += .035) {
      const px = r.x + r.width * x, py = r.y + r.height * y;
      if ([-3, 0, 3].every(offset => v.materialFromPoint(px + offset, py)?.name === "Back touch region")) return { x: px, y: py };
    }
    throw new Error("No back touch region from the rear camera");
  });
  if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await clip(model, "Back warning");
  await expect.poll(() => model.evaluate(e => (e as ModelViewerElement).currentTime)).toBeGreaterThan(.3);
  const times = await model.evaluate((e, point) => {
    const v = e as ModelViewerElement, before = v.currentTime;
    for (let i = 0; i < 2; i++) {
      const init = { pointerId: 9, pointerType: "touch", button: 0, clientX: point.x, clientY: point.y };
      e.dispatchEvent(new PointerEvent("pointerdown", init));
      e.dispatchEvent(new PointerEvent("pointerup", init));
    }
    return { before, after: v.currentTime };
  }, point);
  expect(times.after).toBe(times.before);
  await expect.poll(() => model.evaluate((e, before) => {
    const v = e as ModelViewerElement;
    return v.animationName === "Back warning" && v.currentTime < before;
  }, times.before), { intervals: [50] }).toBe(true);
  await clip(model, "Companion");
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
