"use client";

import { useEffect, useRef } from "react";
import styles from "./logo-hearts.module.css";

// Exact geometry and coordinates of the heart in public/logo.svg. The overlay
// grows over that heart, so the complete static mark remains the fallback.
const HEART = "M64 37C60 34.5 56.5 31.3 56.5 28.1C56.5 23.6 62 22.8 64 26.5C66 22.8 71.5 23.6 71.5 28.1C71.5 31.3 68 34.5 64 37Z";
const CAT_EYES = "M58.5 72.5Q60 71 61.5 72.5M68.5 72.5Q70 71 71.5 72.5";
const BURST_MS = 1400;

/** Decorative header-only response; the surrounding link keeps native behavior. */
export function LogoHearts() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    const link = svg?.closest<HTMLAnchorElement>("a[data-brand]");
    if (!svg || !link) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(any-hover: hover)");
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      clearTimeout(timer);
      timer = undefined;
      delete svg.dataset.playing;
      delete link.dataset.logoPlaying;
    };
    const play = () => {
      if (reduced.matches || timer !== undefined) return;
      svg.dataset.playing = "true";
      link.dataset.logoPlaying = "true";
      // A burst finishes after pointer exit; re-entry cannot stack particles.
      timer = setTimeout(stop, BURST_MS);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && hover.matches) play();
    };
    const focus = () => {
      if (link.matches(":focus-visible")) play();
    };
    const preferenceChanged = () => {
      if (reduced.matches) stop();
    };

    link.addEventListener("pointerenter", enter);
    link.addEventListener("focus", focus);
    reduced.addEventListener("change", preferenceChanged);
    return () => {
      stop();
      link.removeEventListener("pointerenter", enter);
      link.removeEventListener("focus", focus);
      reduced.removeEventListener("change", preferenceChanged);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className={styles.hearts}
      viewBox="0 0 128 120.8"
      aria-hidden="true"
      focusable="false"
      data-logo-hearts
    >
      <path className={styles.pulse} d={HEART} />
      <g className={styles.first}>
        <path d={HEART} />
      </g>
      <g className={styles.second}>
        <path d={HEART} />
      </g>
      <g className={styles.eyes} data-logo-eyes>
        <path d={CAT_EYES} />
      </g>
    </svg>
  );
}
