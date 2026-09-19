"use client";

import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n";
import { type CatReaction, createCatInteraction } from "@/lib/cat-interaction";
import type { createViewerCatPicker } from "@/lib/cat-viewer-runtime";
import { cn } from "@/lib/utils";

// Preload only when start() requests the model, to avoid competing with page content.
const MODEL = "/models/our-cat/cat.glb?v=27";

// The preload and viewer must use the same decoder URL.
const DECODER = "/models/our-cat/meshopt-decoder.js";
const SLOW_LOAD_MS = 10_000;

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
    slow: "Počasnejša povezava? Še se nalaga …",
    unavailable: "3D-ogled ni na voljo.",
  },
  en: {
    alt: "A white cat with grey patches, an olive left eye and a closed right eye.",
    keyboard: "Arrow keys rotate the cat. H, C, B and T touch his head, chin, back and tail. Enter or Space invite a response.",
    loading: "The cat is still loading …",
    slow: "Slow connection? Still loading …",
    unavailable: "The 3D view is unavailable.",
  },
} satisfies Record<Locale, Record<string, string>>;

type Status = "loading" | "revealing" | "ready" | "failed";

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
  onHandle?: (handle: CatModelHandle | null) => void;
}) {
  const text = copy[locale];
  const host = useRef<HTMLDivElement>(null);
  // Observe parent focus so the caption link can trigger model loading.
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [slow, setSlow] = useState(false);
  const ready = status === "ready";
  const loading = status === "loading" || status === "revealing";
  const waiting = ready ? "" : status === "failed" ? text.unavailable : slow ? text.slow : text.loading;
  // Keep loading feedback visible after the first interaction until ready.
  const [reached, setReached] = useState(false);
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
  const wake = useRef(() => {});

  // Hover reveals loading feedback; a touch also queues a reaction.
  const reach = (touch: boolean) => {
    if (status === "ready") return;
    setReached(true);
    if (touch) touched.current = true;
    wake.current();
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
    let attempt = 0;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    let revealFrame: number | undefined;
    let wanted = !startOnReach;
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
    };
    const finishReveal = () => {
      if (loaded && !ready && !disposed) setStatus("ready");
    };
    const onRevealEnd = (event: TransitionEvent) => {
      if (event.target === container && event.propertyName === "opacity") finishReveal();
    };
    const onLoad = () => {
      if (disposed || loaded || !viewer) return;
      clearTimeout(slowTimer);
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
      clearTimeout(slowTimer);
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
      started = true;
      setStatus("loading");
      setSlow(false);
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
      // model-viewer caches even failed loads by URL. Only an explicit reach
      // after failure changes the URL, so it makes a real request without
      // clearing other viewers' caches or retrying on scroll/tab changes.
      const modelUrl = attempt ? `${MODEL}&retry=${attempt}` : MODEL;
      askForHim(modelUrl);
      try {
        const { ModelViewerElement: Viewer } = await import("@google/model-viewer");
        if (disposed) return;
        // Postpone WebGL setup if the viewport or tab changed during the import.
        if (!visible || document.hidden) { started = false; return; }
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
        if (!disposed) onError();
      }
    };
    const takeReach = () => {
      wanted = true;
      void start();
    };
    wake.current = takeReach;

    // Include caption focus: the stage has no focusable viewer until loading finishes.
    const corner = startOnReach ? stage.current?.parentElement : null;
    const onCornerFocus = () => {
      setReached(true);
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
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", onMotionChange);
    return () => {
      disposed = true;
      wake.current = () => {};
      activate.current = () => {};
      corner?.removeEventListener("focusin", onCornerFocus);
      observer?.disconnect();
      clearTimeout(slowTimer);
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      container.removeEventListener("transitionend", onRevealEnd);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", onMotionChange);
      handOver.current?.(null);
      releaseViewer();
    };
  }, [locale, text, framing.orbit, framing.target, startOnReach]);

  return (
    <div
      ref={stage}
      className={cn("relative", loading && "cursor-progress", className)}
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
      {/* Announce loading status immediately; show visual feedback after interaction. */}
      <div
        data-slot="cat-status"
        role="status"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 motion-reduce:transition-none",
          reached && waiting ? "opacity-100" : "opacity-0",
        )}
      >
        {waiting && (
          <Badge variant="overlay-quiet">
            {reached && loading && <LoaderCircle className="animate-spin" aria-hidden />}
            {waiting}
          </Badge>
        )}
      </div>
    </div>
  );
});
