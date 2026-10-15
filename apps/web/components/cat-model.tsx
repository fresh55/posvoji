"use client";

import Image from "next/image";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { PENDING_DELAY_MS } from "@/components/deferred-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { CatReaction, createCatInteraction } from "@/lib/cat-interaction";
import type { createViewerCatPicker } from "@/lib/cat-viewer-runtime";
import { cn } from "@/lib/utils";
import { QUIET_DOC_LINK } from "@/lib/link-styles";
import {
  getServerConnectionSnapshot,
  limitedConnectionEnabled,
  subscribeToConnection,
} from "@/lib/network-preferences";

// Preload only when start() requests the model, to avoid competing with page content.
const MODEL = "/models/our-cat/cat.glb?v=29";

// The preload and viewer must use the same decoder URL.
const DECODER = "/models/our-cat/meshopt-decoder.js";
const SLOW_LOAD_MS = 10_000;
// A request that has neither loaded nor failed by now is treated as failed,
// so the visitor gets the retry instead of a sentence that never ends. A
// working 2G link needs about 35s for the renderer and the model together.
const STALLED_LOAD_MS = 60_000;
// How long loading feedback waits before it draws. A cat who arrives inside
// the wait never draws a chip. A press waits as long as any pending note on
// the site; a hover waits longer, because the progress cursor answers it.
const PRESS_GRACE_MS = PENDING_DELAY_MS;
const HOVER_GRACE_MS = 1_000;
// Below 16rem (the home corner) a status is one 24px round mark, not a
// sentence. The badge and the retry button share it so they never drift.
const SMALL_STAGE_MARK = "@max-3xs/cat:size-6 @max-3xs/cat:p-0";

// Match the viewer request modes so preloads are reused.
const HINTS = [
  { href: MODEL, as: "fetch", crossOrigin: "anonymous" },
  { href: DECODER, as: "script" },
];

/** Camera settings and their matching still, to prevent a jump when WebGL starts. */
export type CatFraming = { orbit: string; target: string; poster: string };

// A picture requires an img fallback; this avoids a request when no source matches.
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Default framing for About and the demo gate. */
const CAT_FRAMING: CatFraming = {
  orbit: "-19deg 81deg 1.45m",
  target: "0m 0.25m 0m",
  poster: "/models/our-cat/poster.webp?v=20",
};

const copy = {
  sl: {
    alt: "Bel maček s sivimi lisami, olivnim levim očesom in zaprtim desnim očesom.",
    keyboard: "Smerne tipke obračajo mačka. H, C, B in T se dotaknejo glave, brade, hrbta in repa. Enter ali preslednica sprožita odziv.",
    loading: "Maček se še nalaga …",
    slow: "Nalaganje traja dlje kot običajno …",
    unavailable: "3D-ogled ni uspel.",
    start: "Zaženi 3D-ogled",
    retry: "Poskusi znova",
  },
  en: {
    alt: "A white cat with grey patches, an olive left eye and a closed right eye.",
    keyboard: "Arrow keys rotate the cat. H, C, B and T touch his head, chin, back and tail. Enter or Space invite a response.",
    loading: "The cat is still loading …",
    slow: "Loading is taking longer than usual …",
    unavailable: "The 3D view couldn’t load.",
    start: "Start 3D view",
    retry: "Try again",
  },
} satisfies Record<Locale, Record<string, string>>;

type Status = "idle" | "loading" | "revealing" | "ready" | "failed";

/** Controls exposed after the model loads. */
export type CatModelHandle = {
  /** Play a reaction when available. Call synchronously during handover to override the queued greeting. */
  react: (name: CatReaction) => boolean;
};

/** Shared model with a still-image fallback. Memoized to avoid updates when the demo password changes. */
export const CatModel = memo(function CatModel({
  locale,
  className,
  sizes,
  posterPriority = false,
  posterMedia,
  framing = CAT_FRAMING,
  startOnReach = false,
  deferOnLimitedConnection = false,
  renderCaption,
  onHandle,
}: {
  locale: Locale;
  className?: string;
  /** The poster's sizes attribute, matching the box className draws. */
  sizes: string;
  /** Prioritize the still when it is the page's largest visible image. */
  posterPriority?: boolean;
  /** Load the still only in matching viewports. CSS display:none alone does not prevent image requests. */
  posterMedia?: string;
  /** Override the camera and provide a matching still. */
  framing?: CatFraming;
  /** Wait for pointer entry or parent keyboard focus before loading; otherwise load when visible. */
  startOnReach?: boolean;
  /** Keep the still on Save-Data and 2G until a press; ordinary visits still start when visible. */
  deferOnLimitedConnection?: boolean;
  /** Put the optional Start/Retry action in the page's caption, outside the still. */
  renderCaption?: (action: ReactNode) => ReactNode;
  onHandle?: (handle: CatModelHandle | null) => void;
}) {
  const text = copy[locale];
  const limitedConnection = useSyncExternalStore(
    subscribeToConnection,
    limitedConnectionEnabled,
    getServerConnectionSnapshot,
  );
  const host = useRef<HTMLDivElement>(null);
  // Observe parent focus so the caption link can trigger model loading.
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [slow, setSlow] = useState(false);
  const ready = status === "ready";
  const failed = status === "failed";
  const loading = status === "loading" || status === "revealing";
  const waiting = loading
    ? (slow ? text.slow : text.loading)
    : (failed ? text.unavailable : "");
  // Keep feedback visible after the first interaction until ready. A press
  // is remembered apart from a hover because it is answered sooner.
  const [reached, setReached] = useState<false | "near" | "press">(false);
  // A press starts the idle stage or retries a failure. Once a request starts,
  // loading feedback owns the stage even if the connection setting changes.
  // The caption holds the action only where the page defers the start, on a
  // limited connection. Elsewhere the retry is drawn on the stage, because a
  // row added under the home corner's bottom-anchored stage lifts the cat.
  const showStartButton = deferOnLimitedConnection && limitedConnection &&
    (status === "idle" || failed);
  // The stage's own retry, unless the caption already holds one. A retry
  // started from it keeps it in place as its pending state, so keyboard focus
  // stays where the visitor left it until the cat arrives or fails again.
  const retryButton = useRef<HTMLButtonElement>(null);
  const [retrying, setRetrying] = useState(false);
  const showRetry = failed ? !showStartButton : retrying && loading;
  const pendingRetry = showRetry && !failed;
  // Once the wait is over the chip stays drawable: a retry turns a failure
  // back into loading, and the visitor who pressed must not wait again.
  // A press restarts the wait a hover began.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!reached || graceOver) return;
    const timer = setTimeout(() => setGraceOver(true),
      reached === "press" ? PRESS_GRACE_MS : HOVER_GRACE_MS);
    return () => clearTimeout(timer);
  }, [reached, graceOver]);
  // A failure is said at once. The chip goes as the still starts to cross
  // into the canvas rather than after it.
  const drawn = reached !== false && (failed || (status === "loading" && graceOver));
  // Replay a touch received while the poster was loading.
  const touched = useRef(false);
  // Update the callback without restarting the WebGL effect.
  const handOver = useRef(onHandle);
  useEffect(() => {
    handOver.current = onHandle;
  });
  const activate = useRef(() => {});
  useEffect(() => {
    // React must remove the still before the first animated frame. Starting
    // playback in transitionend can run ahead of that DOM commit.
    if (ready) activate.current();
  }, [ready]);
  // Trigger loading without restarting the effect or replacing the viewer.
  const wake = useRef<(explicit: boolean) => void>(() => {});

  // Hover reveals loading feedback; a touch also queues a reaction.
  const reach = (touch: boolean) => {
    if (status === "ready") return;
    // Hover can be accidental. On a limited connection only a press opts in.
    if (deferOnLimitedConnection && limitedConnectionEnabled() && !touch) return;
    setReached((current) => touch ? "press" : current || "near");
    if (touch) {
      touched.current = true;
      setRetrying(false);
    }
    wake.current(touch);
  };
  // The stage button's own press. It keeps the button as the pending state.
  const retry = () => {
    reach(true);
    setRetrying(true);
  };

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let viewer: ModelViewerElement | undefined;
    let interaction: ReturnType<typeof createCatInteraction> | undefined;
    let makePicker: typeof createViewerCatPicker | undefined;
    let picker: ReturnType<typeof createViewerCatPicker> | undefined;
    let pickerAsked = false;
    let hints: HTMLLinkElement[] = [];
    let disposed = false;
    let started = false;
    let visible = false;
    let ready = false;
    let loaded = false;
    // Set when the retry button held focus as he arrived.
    let focusOnArrival = false;
    let attempt = 0;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      clearTimeout(slowTimer);
      clearTimeout(stallTimer);
    };
    let revealFrame: number | undefined;
    let wanted = !startOnReach;
    let explicitlyRequested = false;
    const canAnimate = () => ready && visible && !disposed && !document.hidden && !motion.matches;

    // The awake routine is continuous; the controller adds reactions and sleep.
    const syncPlayback = () => {
      if (!viewer || !ready || disposed) return;
      interaction?.syncPlayback();
    };
    // Load precise picking alongside the viewer; use material picking until it is ready.
    const buildPicker = () => {
      if (disposed || !loaded || !viewer || !makePicker) return;
      picker?.dispose();
      try { picker = makePicker(viewer); }
      catch { picker = undefined; }
    };
    const askForPicker = () => {
      if (pickerAsked) return;
      pickerAsked = true;
      void import("@/lib/cat-viewer-runtime").then(
        (module) => {
          if (disposed) return;
          makePicker = module.createViewerCatPicker;
          // The model may finish loading before this import.
          if (loaded) buildPicker();
        },
        () => {},
      );
    };
    activate.current = () => {
      if (!loaded || ready || disposed) return;
      ready = true;
      syncPlayback();
      const controller = interaction;
      if (controller) handOver.current?.({ react: (name) => controller.react(name) });
      // A synchronous handover reaction takes precedence over the queued touch.
      if (touched.current) {
        touched.current = false;
        controller?.react("Notice");
      }
      // The button that held focus is gone with the still. model-viewer does
      // not delegate focus from its element, so focus its own input surface.
      if (focusOnArrival) {
        focusOnArrival = false;
        viewer?.shadowRoot?.querySelector<HTMLElement>(".userInput")?.focus();
      }
    };
    const finishReveal = () => {
      if (!loaded || ready || disposed) return;
      focusOnArrival = !!retryButton.current &&
        document.activeElement === retryButton.current;
      setStatus("ready");
    };
    const onRevealEnd = (event: TransitionEvent) => {
      if (event.target === container && event.propertyName === "opacity") finishReveal();
    };
    const onLoad = () => {
      if (disposed || loaded || !viewer) return;
      clearTimers();
      // Hold the matching first pose throughout the reveal. Animation, the
      // page's handle and a remembered touch all wait until the still leaves.
      viewer.pause();
      viewer.currentTime = 0;
      loaded = true;
      buildPicker();
      setStatus("revealing");
      if (motion.matches) finishReveal();
      else {
        // No transitionend is emitted if styles disable the transition or
        // the host is already opaque. Check once after React's style commit;
        // the ordinary fade completes through transitionend, not a timer.
        revealFrame = requestAnimationFrame(() => {
          revealFrame = requestAnimationFrame(() => {
            if (getComputedStyle(container).opacity === "1") finishReveal();
          });
        });
      }
    };
    const releaseViewer = () => {
      interaction?.dispose();
      interaction = undefined;
      picker?.dispose();
      picker = undefined;
      viewer?.removeEventListener("load", onLoad);
      viewer?.removeEventListener("error", onError);
      viewer?.pause();
      viewer?.remove();
      viewer = undefined;
      for (const link of hints) link.remove();
      hints = [];
    };
    const onError = () => {
      if (disposed) return;
      clearTimers();
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      loaded = false;
      ready = false;
      started = false;
      wanted = false;
      attempt += 1;
      releaseViewer();
      handOver.current?.(null);
      setStatus("failed");
    };

    // Start model and decoder downloads alongside the viewer import, after the loading gate.
    const askForHim = (modelUrl: string) => {
      if (hints.length) return;
      hints = HINTS.map(({ href, as, crossOrigin }) => {
        const link = document.createElement("link");
        link.setAttribute("rel", "preload");
        link.setAttribute("as", as);
        // Keep the static poster and other page content ahead of these downloads.
        link.setAttribute("fetchpriority", "low");
        if (crossOrigin) link.setAttribute("crossorigin", crossOrigin);
        // Set the URL after the request attributes.
        link.setAttribute("href", href === MODEL ? modelUrl : href);
        document.head.append(link);
        return link;
      });
    };

    // Import client-side only, when visible and requested; the module accesses browser globals.
    const start = async () => {
      if (!wanted || started || disposed || !visible || document.hidden) return;
      if (deferOnLimitedConnection && limitedConnectionEnabled() && !explicitlyRequested) return;
      started = true;
      setStatus("loading");
      setSlow(false);
      slowTimer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
      stallTimer = setTimeout(onError, STALLED_LOAD_MS);
      // model-viewer caches even failed loads by URL. Only an explicit reach
      // after failure changes the URL, so it makes a real request without
      // clearing other viewers' caches or retrying on scroll/tab changes.
      const run = attempt;
      const modelUrl = run ? `${MODEL}&retry=${run}` : MODEL;
      askForHim(modelUrl);
      try {
        const [{ ModelViewerElement: Viewer }, { createCatInteraction }] = await Promise.all([
          import("@google/model-viewer"),
          import("@/lib/cat-interaction"),
        ]);
        // A stalled request may have been given up on while the import ran.
        if (disposed || run !== attempt) return;
        // Postpone WebGL setup if the viewport or tab changed during the import.
        if (!visible || document.hidden) {
          started = false;
          clearTimers();
          return;
        }
        askForPicker();
        Viewer.meshoptDecoderLocation = DECODER;
        viewer = document.createElement("model-viewer") as ModelViewerElement;
        const attributes = {
          src: modelUrl,
          alt: text.alt,
          "camera-controls": "",
          "disable-pan": "",
          "disable-zoom": "",
          "disable-tap": "",
          "touch-action": "pan-y",
          "interaction-prompt": "none",
          // The default camera leaves room for the animation at every allowed orbit.
          "camera-orbit": framing.orbit,
          "camera-target": framing.target,
          "min-camera-orbit": "auto 55deg 0.65m",
          "max-camera-orbit": "auto 95deg 2m",
          "field-of-view": "30deg",
          "shadow-intensity": "0.6",
          "shadow-softness": "1",
          "tone-mapping": "neutral",
          "environment-image": "neutral",
          exposure: "0.9",
          "animation-name": "Companion",
          "aria-keyshortcuts": "Enter Space H C B T",
        };
        for (const [name, value] of Object.entries(attributes)) {
          viewer.setAttribute(name, value);
        }
        viewer.style.width = "100%";
        viewer.style.height = "100%";
        viewer.style.setProperty("--progress-bar-color", "transparent");
        viewer.a11y = {
          left: locale === "sl" ? "Pogled z leve" : "View from the left",
          right: locale === "sl" ? "Pogled z desne" : "View from the right",
          front: locale === "sl" ? "Pogled od spredaj" : "View from the front",
          back: locale === "sl" ? "Pogled od zadaj" : "View from the back",
          "upper-left": locale === "sl" ? "Pogled od zgoraj levo" : "View from above left",
          "upper-right": locale === "sl" ? "Pogled od zgoraj desno" : "View from above right",
          "upper-front": locale === "sl" ? "Pogled od zgoraj spredaj" : "View from above front",
          "upper-back": locale === "sl" ? "Pogled od zgoraj zadaj" : "View from above back",
          "lower-left": locale === "sl" ? "Pogled od spodaj levo" : "View from below left",
          "lower-right": locale === "sl" ? "Pogled od spodaj desno" : "View from below right",
          "lower-front": locale === "sl" ? "Pogled od spodaj spredaj" : "View from below front",
          "lower-back": locale === "sl" ? "Pogled od spodaj zadaj" : "View from below back",
          "interaction-prompt": text.keyboard,
        };
        viewer.addEventListener("load", onLoad);
        viewer.addEventListener("error", onError);
        const element = viewer;
        // Use the precise picker when ready; material picking is the loading fallback.
        interaction = createCatInteraction(viewer, canAnimate, (x, y) => {
          if (picker) return picker.pick(x, y);
          const material = element.materialFromPoint(x, y)?.name;
          if (!material) return null;
          const hit = element.positionAndNormalFromPoint(x, y);
          return hit ? { material, position: hit.position } : null;
        });
        container.append(viewer);
      } catch {
        if (run === attempt) onError();
      }
    };
    const takeReach = (explicit = false) => {
      // Hover and caption focus may start the first visit, but must not consume
      // the retry action while someone is moving to it or tabbing onto it.
      if (attempt > 0 && !explicit) return;
      if (deferOnLimitedConnection && limitedConnectionEnabled() && !explicit) return;
      explicitlyRequested ||= explicit;
      wanted = true;
      void start();
    };
    wake.current = takeReach;

    // Include caption focus: the stage has no focusable viewer until loading finishes.
    const corner = startOnReach ? stage.current?.parentElement : null;
    const onCornerFocus = () => {
      setReached((current) => current || "near");
      takeReach();
    };
    corner?.addEventListener("focusin", onCornerFocus);
    const observer = typeof IntersectionObserver === "undefined" ? null :
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) void start();
        syncPlayback();
      });
    if (observer) observer.observe(container);
    else {
      visible = true;
      void start();
    }
    const onVisibilityChange = () => {
      void start();
      syncPlayback();
    };
    const onMotionChange = () => {
      if (motion.matches) finishReveal();
      syncPlayback();
    };
    container.addEventListener("transitionend", onRevealEnd);
    // A responsive ancestor can hide the stage mid-fade, cancelling its end event.
    container.addEventListener("transitioncancel", onRevealEnd);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", onMotionChange);
    const unsubscribeConnection = deferOnLimitedConnection
      ? subscribeToConnection(() => { void start(); })
      : () => {};
    return () => {
      disposed = true;
      wake.current = () => {};
      activate.current = () => {};
      corner?.removeEventListener("focusin", onCornerFocus);
      observer?.disconnect();
      clearTimers();
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      container.removeEventListener("transitionend", onRevealEnd);
      container.removeEventListener("transitioncancel", onRevealEnd);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", onMotionChange);
      unsubscribeConnection();
      handOver.current?.(null);
      releaseViewer();
    };
  }, [locale, text, framing.orbit, framing.target, startOnReach, deferOnLimitedConnection]);

  const startAction = showStartButton ? (
    <button type="button" className={QUIET_DOC_LINK} onClick={() => reach(true)}>
      {failed ? text.retry : text.start}
    </button>
  ) : null;

  return (
    <>
      <div
        ref={stage}
        className={cn("@container/cat relative", loading && "cursor-progress", className)}
        onPointerEnter={() => reach(false)}
        onPointerDown={() => reach(true)}
      >
        {/* The transparent fallback prevents downloads outside posterMedia. */}
        <picture>
          {posterMedia && <source media={posterMedia} srcSet={framing.poster} />}
          <Image
            src={posterMedia ? BLANK_PIXEL : framing.poster}
            alt={ready ? "" : text.alt}
            fill
            // Load the still eagerly; only prioritize it when it is the largest visible image.
            loading="eager"
            {...(posterPriority ? { priority: true } : { fetchPriority: "low" as const })}
            sizes={sizes}
            className={`object-contain ${ready ? "invisible" : ""}`}
          />
        </picture>
        {/* inert removes the loading viewer from tab order; aria-hidden also hides it from assistive technology. */}
        <div
          ref={host}
          inert={!ready}
          aria-hidden={!ready}
          className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${status === "revealing" || ready ? "opacity-100" : "opacity-0"}`}
        />
        {/* Announce loading once requested; show visual feedback after interaction. */}
        <div
          data-slot="cat-status"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-2 flex flex-wrap items-center justify-center gap-1.5 px-2 transition-opacity duration-200 motion-reduce:transition-none",
            drawn ? "opacity-100" : "opacity-0",
          )}
        >
          {/* The live region only speaks; what is drawn is hidden from it. */}
          <div role="status" className="sr-only">{waiting}</div>
          {/* On a small stage every state is one round mark in one place: the
              spinner, then the retry arrow, then the retry spinning. A
              pending retry is drawn by its own button alone. */}
          {waiting && !pendingRetry && (
            <Badge
              variant="overlay-quiet"
              aria-hidden
              className={cn(
                "h-auto max-w-full text-center whitespace-normal",
                SMALL_STAGE_MARK,
                showRetry && "@max-3xs/cat:hidden",
              )}
            >
              {reached && loading && <LoaderCircle className="animate-spin" />}
              <span className="@max-3xs/cat:hidden">{waiting}</span>
            </Badge>
          )}
          {showRetry && (
            <Button
              ref={retryButton}
              type="button"
              variant="outline"
              size="xs"
              aria-disabled={failed ? undefined : true}
              title={text.unavailable}
              // Opaque in both themes: it sits on the still, where a wash has
              // nothing to tint but the cat.
              className={cn(
                "pointer-events-auto rounded-full aria-disabled:cursor-progress aria-disabled:text-muted-foreground dark:bg-background dark:hover:bg-muted pointer-coarse:tap-target",
                SMALL_STAGE_MARK,
              )}
              // A Tab to it draws the chip it belongs to.
              onFocus={() => setReached((current) => current || "near")}
              // The press is the button's, not the poster's behind it.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => { if (failed) retry(); }}
            >
              {failed ? <RotateCcw aria-hidden /> : <LoaderCircle className="animate-spin" aria-hidden />}
              <span className="@max-3xs/cat:sr-only">{text.retry}</span>
            </Button>
          )}
        </div>
      </div>
      {renderCaption ? renderCaption(startAction) : startAction}
    </>
  );
});
