"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import type { Locale } from "@/lib/i18n";
import { type CatReaction, createCatInteraction } from "@/lib/cat-interaction";
import { cn } from "@/lib/utils";

const MODEL = "/models/our-cat/cat.glb?v=19.1";
// The poster uses the same resting pose and camera as the interactive model.
const POSTER = "/models/our-cat/poster.webp?v=19.1";

const copy = {
  sl: {
    alt: "Bel maček s sivimi lisami, olivnim levim očesom in zaprtim desnim očesom.",
    keyboard: "Smerne tipke obračajo mačka. H, C, B in T se dotaknejo glave, brade, hrbta in repa. Enter ali preslednica sprožita odziv.",
    loading: "Nalaganje mačka v 3D …",
    unavailable: "3D-ogled trenutno ni na voljo. Prikazana je slika mačka.",
  },
  en: {
    alt: "A white cat with grey patches, an olive left eye and a closed right eye.",
    keyboard: "Arrow keys rotate the cat. H, C, B and T touch his head, chin, back and tail. Enter or Space invite a response.",
    loading: "Loading the cat in 3D …",
    unavailable: "The 3D view is unavailable. A still image of the cat is shown.",
  },
} satisfies Record<Locale, Record<string, string>>;

type Status = "loading" | "ready" | "failed";

/** What a page can ask of the cat once he is on screen. */
export type CatModelHandle = {
  /** Plays one authored reaction if the cat is awake and free. */
  react: (name: CatReaction) => boolean;
};

/**
 * Srečko in 3D, with the still render underneath until WebGL takes over.
 *
 * The about page shows him below a caption, the demo gate above a password
 * field. Both want the same model, camera and touch controller, so it lives
 * here once and each page wraps it in its own figure. The box takes its
 * height from className.
 *
 * memo, because the gate re-renders on every keystroke and this subtree
 * holds a live WebGL canvas.
 */
export const CatModel = memo(function CatModel({
  locale,
  className,
  sizes,
  posterPriority = false,
  onHandle,
}: {
  locale: Locale;
  className?: string;
  /** The poster's sizes attribute, matching the box className draws. */
  sizes: string;
  /**
   * Whether the poster is the page's largest paint. It is on the gate, where
   * the cat is the first thing above the fold and the only thing that paints
   * while ~2MB of WebGL arrives; it is not on the about page, where he sits
   * below the fold and is often never fetched at all.
   */
  posterPriority?: boolean;
  onHandle?: (handle: CatModelHandle | null) => void;
}) {
  const text = copy[locale];
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Read from inside the one long-lived effect below, so it is kept current
  // here without restarting it.
  const handOver = useRef(onHandle);
  useEffect(() => {
    handOver.current = onHandle;
  });

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let viewer: ModelViewerElement | undefined;
    let interaction: ReturnType<typeof createCatInteraction> | undefined;
    let disposed = false;
    let started = false;
    let visible = false;
    let ready = false;
    const canAnimate = () => ready && visible && !disposed && !document.hidden && !motion.matches;

    // The awake routine is continuous; the controller adds reactions and sleep.
    const syncPlayback = () => {
      if (!viewer || !ready || disposed) return;
      interaction?.syncPlayback();
    };
    const onLoad = () => {
      // Apply the seated first frame even when reduced motion starts paused.
      if (viewer) viewer.currentTime = 0;
      ready = true;
      setStatus("ready");
      syncPlayback();
      const controller = interaction;
      if (controller) handOver.current?.({ react: (name) => controller.react(name) });
    };
    const onError = () => {
      ready = false;
      interaction?.syncPlayback();
      viewer?.pause();
      handOver.current?.(null);
      setStatus("failed");
    };

    // Importing the custom element on the server would access browser globals.
    // The model and renderer also stay out of other routes and offscreen loads.
    const start = async () => {
      if (started) return;
      started = true;
      try {
        const { ModelViewerElement: Viewer } = await import("@google/model-viewer");
        if (disposed) return;
        Viewer.meshoptDecoderLocation = "/models/our-cat/meshopt-decoder.js";
        viewer = document.createElement("model-viewer") as ModelViewerElement;
        const attributes = {
          src: MODEL,
          alt: text.alt,
          "camera-controls": "",
          "disable-pan": "",
          "disable-zoom": "",
          "disable-tap": "",
          "touch-action": "pan-y",
          "interaction-prompt": "none",
          // 1.45m, not the 1.15m this was framed at. The canvas draws nothing
          // outside itself, so a pose that reaches past the element edge is
          // cut there, and the visitor can orbit freely: measured at 1280,
          // 65 of 216 sampled angle-and-time combinations lost part of the
          // cat, the worst of them 39px of ear and haunch. It is not a band
          // that can be fenced off either. Sampling every 30 degrees, the
          // clipped headings alternate with clean ones (-120 and -90 bad, -60
          // clean, -30 bad, 0 clean, 30 and 60 bad), because what reaches the
          // edge depends on the pose as much as the heading.
          //
          // Pulling back is the one move that answers all of them at once. At
          // 1.45m nothing touches an edge at any heading, at either end of the
          // 55-95deg tilt, anywhere in the clip, at 1280, 1024 or 375. The cat
          // draws about a fifth smaller for it, which is the price of never
          // cutting him.
          "camera-orbit": "-19deg 81deg 1.45m",
          "camera-target": "0m 0.25m 0m",
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
        interaction = createCatInteraction(viewer, canAnimate);
        container.append(viewer);
      } catch {
        if (!disposed) onError();
      }
    };
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
    document.addEventListener("visibilitychange", syncPlayback);
    motion.addEventListener("change", syncPlayback);
    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      motion.removeEventListener("change", syncPlayback);
      handOver.current?.(null);
      interaction?.dispose();
      viewer?.removeEventListener("load", onLoad);
      viewer?.removeEventListener("error", onError);
      viewer?.pause();
      viewer?.remove();
    };
  }, [locale, text]);

  return (
    <>
      <div className={cn("relative", className)}>
        <Image
          src={POSTER}
          alt={status === "ready" ? "" : text.alt}
          fill
          // Load the fallback immediately. Where WebGL can replace it before
          // it paints, don't speculatively preload it either (React skips
          // low); where it is the largest paint, put it at the front instead.
          loading="eager"
          {...(posterPriority ? { priority: true } : { fetchPriority: "low" as const })}
          sizes={sizes}
          className={`object-contain ${status === "ready" ? "invisible" : ""}`}
        />
        <div
          ref={host}
          aria-hidden={status !== "ready"}
          className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <span className="sr-only" role="status">
        {status === "ready" ? "" : status === "failed" ? text.unavailable : text.loading}
      </span>
    </>
  );
});
