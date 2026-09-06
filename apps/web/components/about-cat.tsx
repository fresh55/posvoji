"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import type { Locale } from "@/lib/i18n";

const MODEL = "/models/our-cat/cat.glb?v=5.0";
// 5.1: re-rendered at the camera below. The still and the model have to agree
// on how big the cat is, or the handover is a jump rather than a swap. Framed
// at 1.15m against a model now drawn at 1.45m, the cat shrank 37% the moment
// the viewer took over.
const POSTER = "/models/our-cat/poster.webp?v=5.1";

const copy = {
  sl: {
    alt: "Bel maček s sivimi lisami, olivnim levim očesom in zaprtim desnim očesom.",
    keyboard: "Za obračanje uporabi miško, dotik ali smerne tipke.",
    loading: "Nalaganje mačka v 3D …",
    unavailable: "3D-ogled trenutno ni na voljo. Prikazana je slika mačka.",
  },
  en: {
    alt: "A white cat with grey patches, an olive left eye and a closed right eye.",
    keyboard: "Use mouse, touch or arrow keys to rotate.",
    loading: "Loading the cat in 3D …",
    unavailable: "The 3D view is unavailable. A still image of the cat is shown.",
  },
} satisfies Record<Locale, Record<string, string>>;

/** A browser-only enhancement of the still image, scoped to the about page. */
export function AboutCat({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let viewer: ModelViewerElement | undefined;
    let disposed = false;
    let started = false;
    let visible = false;
    let ready = false;
    const canAnimate = () => ready && visible && !disposed && !document.hidden && !motion.matches;

    // Resting, licking and both transitions are baked into one continuous clip.
    const syncPlayback = () => {
      if (!viewer || !ready || disposed) return;
      if (canAnimate()) viewer.play();
      else viewer.pause();
    };
    const onLoad = () => {
      // Apply the seated first frame even when reduced motion starts paused.
      if (viewer) viewer.currentTime = 0;
      ready = true;
      setStatus("ready");
      syncPlayback();
    };
    const onError = () => {
      ready = false;
      viewer?.pause();
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
      viewer?.removeEventListener("load", onLoad);
      viewer?.removeEventListener("error", onError);
      viewer?.pause();
      viewer?.remove();
    };
  }, [locale, text]);

  return (
    <figure className="mx-auto w-full max-w-md">
      <div className="relative h-80 sm:h-[28rem] lg:h-[31rem]">
        <Image
          src={POSTER}
          alt={status === "ready" ? "" : text.alt}
          fill
          loading="eager"
          sizes="(min-width: 1024px) 420px, (min-width: 640px) 448px, 100vw"
          className={`object-contain ${status === "ready" ? "invisible" : ""}`}
        />
        <div
          ref={host}
          aria-hidden={status !== "ready"}
          className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <figcaption className="sr-only" role="status">
        {status === "ready" ? "" : status === "failed" ? text.unavailable : text.loading}
      </figcaption>
    </figure>
  );
}
