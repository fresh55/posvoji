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

// No head preload, although React would hoist one from the tree below.
// Measured on the gate over throttled 4G a link in the head started the 1.1MB
// download at 60ms instead of 1.5s and still finished only 0.3s sooner (0.8s
// on slow 4G): from there it is bandwidth-bound against the hydration chunks,
// on every visit to a page that may never show him. The link start() inserts
// is a different thing. It begins the same download at the moment the stage
// has already decided to fetch him, so the only chunk it competes with is the
// renderer it is waiting for, and it never runs where he is not wanted.
const MODEL = "/models/our-cat/cat.glb?v=27";

// What the viewer asks for once its chunk has evaluated, asked for at the same
// moment as the chunk instead of after it: the model, which used to wait for
// the element to exist, and the meshopt decoder it cannot read the model
// without. Each link has to describe the request the viewer will make, or the
// browser keeps the preload and fetches the file a second time. The model goes
// through three's FileLoader, a fetch in cors mode with same-origin
// credentials, which is what crossorigin says here; the decoder arrives on a
// plain async <script>, which is as="script" and no crossorigin. Traced on the
// built page: one request each, and the model's is the link's.
const HINTS = [
  { href: MODEL, as: "fetch", crossOrigin: "anonymous" },
  { href: "/models/our-cat/meshopt-decoder.js", as: "script" },
];

/** A camera and the still rendered from it: the poster is the model's own
 *  first frame at that framing, so he does not jump when WebGL takes over. */
export type CatFraming = { orbit: string; target: string; poster: string };

// One transparent pixel, and the only thing a caller that gates its poster
// draws where the gate does not match. A <picture> has to end in an <img>,
// and whatever that <img> points at is what the browser fetches when no
// <source> matches, so it has to be something that costs nothing.
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** The about page's and the gate's framing; see the note on camera-orbit. */
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
    unavailable: "3D-ogled ni na voljo.",
  },
  en: {
    alt: "A white cat with grey patches, an olive left eye and a closed right eye.",
    keyboard: "Arrow keys rotate the cat. H, C, B and T touch his head, chin, back and tail. Enter or Space invite a response.",
    loading: "The cat is still loading …",
    unavailable: "The 3D view is unavailable.",
  },
} satisfies Record<Locale, Record<string, string>>;

type Status = "loading" | "ready" | "failed";

/** What a page can ask of the cat once he is on screen. */
export type CatModelHandle = {
  /**
   * Plays one authored reaction if the cat is awake and free.
   *
   * Ask during handover to take precedence over the stage's own greeting for
   * a visitor who touched the poster while it loaded. That only holds while
   * the call is synchronous: deferring it to an effect or a microtask loses
   * the race, because by then the greeting is playing and this returns false.
   */
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
 * Nothing tells a visitor that the cat they are touching is a picture: the
 * wait measured 1.3s on a fast desktop, 4.7s on a phone over 4G, over 10s on
 * slow 4G. Only the visitor who reaches for him is told. Most never touch
 * him, on the gate they came to type a password, and a picture that quietly
 * comes alive is a better moment than one a spinner announces.
 *
 * memo, because the gate re-renders on every keystroke and this subtree
 * holds a live WebGL canvas.
 */
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
  /**
   * Whether the poster is the page's largest paint. It is on the gate, where
   * the cat is the first thing above the fold and the only thing that paints
   * while ~2MB of WebGL arrives; it is not on the about page, where he sits
   * below the fold and is often never fetched at all.
   */
  posterPriority?: boolean;
  /**
   * The media condition under which the poster is worth downloading, for a
   * caller whose figure is not drawn at every viewport. The still is the
   * first thing this stage paints, so it cannot be lazy or gated in script:
   * a `display:none` figure fetches it all the same (measured). A <picture>
   * is the one gate a static export can express in markup, and below it the
   * browser picks a transparent pixel and asks for nothing.
   *
   * Left unset the poster loads everywhere, which is what a figure that is
   * always drawn wants.
   */
  posterMedia?: string;
  /**
   * A closer framing than the default, for a stage too short to show him
   * at 1.45m. The default never cuts him at any heading; a closer camera
   * trades that for size, and the caller owns the trade and the poster.
   * The camera is an input of the WebGL effect below, the poster is not.
   */
  framing?: CatFraming;
  /**
   * Fetch the model and the renderer on the visitor's first reach for the
   * stage rather than as soon as it is on screen. For a stage that is on
   * screen from the first paint of a page whose first seconds belong to
   * something else.
   *
   * This was the page's load event plus an idle callback, and an idle moment
   * is not a free one: on a fast connection load fires around 150ms, so the
   * idle callback ran at about half a second, which is where the visitor is
   * reaching for whatever the page came to show them. Decoding him holds the
   * main thread for the better part of a second and there is no dividing that
   * into frames from here. A reach is the one moment at which that second is
   * his to take, and it is already the moment the stage starts speaking: the
   * progress cursor and the loading label wait for the same reach.
   *
   * A reach is a pointer entering the stage or keyboard focus arriving
   * anywhere in the box the page put the stage in, so a visitor who never
   * touches a pointer meets him on the Tab that reaches his corner.
   *
   * Left unset he starts as soon as he is on screen, which is what a stage
   * the visitor scrolled to wants.
   */
  startOnReach?: boolean;
  onHandle?: (handle: CatModelHandle | null) => void;
}) {
  const text = copy[locale];
  const host = useRef<HTMLDivElement>(null);
  // The stage itself, for the one thing the effect needs that is outside it:
  // the box the page put it in, which is where a keyboard reach lands.
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  // What the stage still owes the visitor, and empty once it owes nothing.
  // One expression, so the label's text, its box and whether it is drawn
  // cannot fall out of step.
  // The ready/not-ready split, named once. The three-way checks below still
  // read `status`, because they distinguish loading from failed.
  const ready = status === "ready";
  const waiting = ready ? "" : status === "failed" ? text.unavailable : text.loading;
  // Whether the visitor has reached for him before he was there. The label
  // is drawn from then on, and stays until he is, rather than following the
  // pointer in and out.
  const [reached, setReached] = useState(false);
  // A touch the poster took while he was still loading, for him to answer.
  const touched = useRef(false);
  // Read from inside the one long-lived effect below, so it is kept current
  // here without restarting it.
  const handOver = useRef(onHandle);
  useEffect(() => {
    handOver.current = onHandle;
  });
  // The other way round: the reach reaching into the effect. He is fetched
  // from inside it, so the reach has to be told to it rather than made a
  // dependency of it, which would restart it and take the observer, and on a
  // stage already running the viewer, down with it. It is a no-op both where
  // nothing waits for a reach and once he is under way.
  const wake = useRef(() => {});

  // What the label answers, and what the cat answers after it. A hover only
  // asks the question; a touch is the one he owes a glance, and only while
  // there is still something to wait for.
  const reach = (touch: boolean) => {
    if (status === "ready") return;
    setReached(true);
    if (touch && status === "loading") touched.current = true;
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
    // Whether anyone wants him yet. On screen is the answer everywhere but a
    // stage that waits for a reach, where the reach below is.
    let wanted = !startOnReach;
    const canAnimate = () => ready && visible && !disposed && !document.hidden && !motion.matches;

    // The awake routine is continuous; the controller adds reactions and sleep.
    const syncPlayback = () => {
      if (!viewer || !ready || disposed) return;
      interaction?.syncPlayback();
    };
    // The precomputed picking regions, and the one thing here that waits for
    // the load event rather than racing it. Its chunk is 157KB, nearly all of
    // it picking.json, and nothing can be picked before there is a cat: until
    // it arrives the controller picks through the viewer's own public API (the
    // fallback in start()), which is coarser but answers the same question.
    // Asked for on load rather than on the first reach after it, because the
    // main thread is free at that moment and a reach is not a spare one: the
    // visitor who reaches is the one whose first touch would then wait for it.
    const takePicker = async () => {
      if (!pickerAsked) {
        pickerAsked = true;
        try { makePicker = (await import("@/lib/cat-viewer-runtime")).createViewerCatPicker; }
        catch { return; }
      }
      if (disposed || !ready || !viewer || !makePicker) return;
      picker?.dispose();
      try { picker = makePicker(viewer); }
      catch { picker = undefined; }
    };
    const onLoad = () => {
      // Apply the seated first frame even when reduced motion starts paused.
      if (viewer) viewer.currentTime = 0;
      // Whatever the old picker held is a scene that has just been replaced.
      picker?.dispose();
      picker = undefined;
      ready = true;
      setStatus("ready");
      syncPlayback();
      const controller = interaction;
      if (controller) handOver.current?.({ react: (name) => controller.react(name) });
      // The page's own request, if it made one on handover, comes first; his
      // glance at whoever reached for the poster gives way to it.
      if (touched.current) {
        touched.current = false;
        controller?.react("Notice");
      }
      void takePicker();
    };
    const onError = () => {
      ready = false;
      interaction?.syncPlayback();
      viewer?.pause();
      handOver.current?.(null);
      setStatus("failed");
    };

    // The two requests the viewer will make, asked for in the same tick as its
    // chunk. Called from start() and nowhere else, so start()'s gate is the
    // whole gate: a route that never shows him, a stage still waiting for a
    // reach and a hidden tab ask for nothing.
    const askForHim = () => {
      if (hints.length) return;
      hints = HINTS.map(({ href, as, crossOrigin }) => {
        const link = document.createElement("link");
        link.setAttribute("rel", "preload");
        link.setAttribute("as", as);
        if (crossOrigin) link.setAttribute("crossorigin", crossOrigin);
        // Last, so the request goes out with the rest already on the element.
        link.setAttribute("href", href);
        document.head.append(link);
        return link;
      });
    };

    // Importing the custom element on the server would access browser globals.
    // The model and renderer also stay out of other routes and offscreen loads.
    //
    // The model's download used to begin only after the chunk had arrived and
    // evaluated and the element had been created, which on a throttled phone
    // (1.6Mbps, 150ms RTT, 4x CPU) put its first byte 2.4s after the stage
    // came into view. The links above start it with the chunk instead, so the
    // three share the wire rather than queue behind one another: five paired
    // runs of the built page moved the model's last byte from 11.1s to 10.2s
    // and the load event from 12.4s to 11.7s. The element appears about a
    // second later for it, because the chunk now waits on the model for
    // bandwidth, and nothing is drawn before the model in any case.
    const start = async () => {
      if (!wanted || started || disposed || !visible || document.hidden) return;
      started = true;
      askForHim();
      try {
        const { ModelViewerElement: Viewer } = await import("@google/model-viewer");
        if (disposed) return;
        // The visitor may have scrolled away or hidden the tab during the
        // wait. Keep the chunk and whatever the links have already pulled
        // down, but postpone WebGL setup.
        if (!visible || document.hidden) { started = false; return; }
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
        // The picker, once it has landed, and the viewer's own picking until
        // then. The controller asks this on every touch, so it reads the
        // current answer rather than the one that held when it was built.
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
    // The reach a gated stage was waiting for. The pointer's arrives through
    // the handler above; the keyboard's through the corner below.
    const takeReach = () => {
      wanted = true;
      void start();
    };
    wake.current = takeReach;

    // A Tab into the corner is a reach too. Until he loads there is nothing
    // inside the stage for focus to land on, so the corner is the box the
    // page put the stage in: on the home page that box is the figure, and the
    // one thing a Tab can reach in it is his caption link, right under him.
    // Without this a visitor who never touches a pointer never meets him.
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
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", syncPlayback);
    return () => {
      disposed = true;
      wake.current = () => {};
      corner?.removeEventListener("focusin", onCornerFocus);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", syncPlayback);
      handOver.current?.(null);
      interaction?.dispose();
      picker?.dispose();
      for (const link of hints) link.remove();
      hints = [];
      viewer?.removeEventListener("load", onLoad);
      viewer?.removeEventListener("error", onError);
      viewer?.pause();
      viewer?.remove();
    };
  }, [locale, text, framing.orbit, framing.target, startOnReach]);

  return (
    <div
      ref={stage}
      className={cn("relative", status === "loading" && "cursor-progress", className)}
      onPointerEnter={() => reach(false)}
      onPointerDown={() => reach(true)}
    >
      {/* The source is what the browser downloads wherever posterMedia
          matches; the img under it is the fallback and carries everything
          else, so an ungated caller renders the same element it always did
          inside a wrapper that draws nothing. */}
      <picture>
        {posterMedia && <source media={posterMedia} srcSet={framing.poster} />}
        <Image
          src={posterMedia ? BLANK_PIXEL : framing.poster}
          alt={ready ? "" : text.alt}
          fill
          // Load the fallback immediately. Where WebGL can replace it before
          // it paints, don't speculatively preload it either (React skips
          // low); where it is the largest paint, put it at the front instead.
          loading="eager"
          {...(posterPriority ? { priority: true } : { fetchPriority: "low" as const })}
          sizes={sizes}
          className={`object-contain ${ready ? "invisible" : ""}`}
        />
      </picture>
      {/* inert alongside aria-hidden, and not aria-hidden alone.
          <model-viewer> is appended into this host as soon as the module
          arrives, which is long before `ready`, and its shadow root keeps a
          focusable poster button at the host's full size. aria-hidden prunes
          that button from the accessibility tree without taking it out of the
          tab order, which is the aria-hidden-focus failure exactly: measured
          on /o-nas under slow-4G throttling, a plain Tab walk from the top of
          the document stopped on a 448x496 element that announced nothing,
          between the contact address and Srečko's link. opacity-0 does not
          help, because an element at zero opacity is still focusable.

          Not a transient state either. Where WebGL never comes up or the .glb
          never arrives, `ready` never happens and the dead stop is permanent.

          inert is the half that removes it from the tab order; aria-hidden
          stays because it is what the older browsers in this audience read,
          and the two say the same thing. Both come off together at `ready`,
          where the viewer is a real image with a real name and belongs in
          both trees. */}
      <div
        ref={host}
        inert={!ready}
        aria-hidden={!ready}
        className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
      />
      {/* The one thing ever drawn over the stage, and only while there is
          no cat to touch and someone has tried. It sits at the foot, on the
          floor shadow, where no pose reaches. Screen readers have the text
          from the start; the eyes get it on the first reach. The spinner
          waits for that reach too, or it would turn unseen for the whole
          life of an about page nobody scrolled down. */}
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
            {reached && status === "loading" && <LoaderCircle className="animate-spin" aria-hidden />}
            {waiting}
          </Badge>
        )}
      </div>
    </div>
  );
});
