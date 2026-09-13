"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A boundary around one part of a page, so a throw inside it costs that part
 * and nothing else.
 *
 * There was none anywhere in this app. React unmounts the whole tree under
 * the nearest boundary, and with no boundary at all the nearest is the route,
 * so a render that throws inside a decorative component took the document it
 * decorated down to Next's error page with it. On the found-animal page that
 * is a phone number lost to a map.
 *
 * A class, because that is what React offers: getDerivedStateFromError and
 * componentDidCatch have no hook form. It renders no wrapper element, so it
 * can sit inside a grid without becoming one of its items.
 *
 * The fallback is required and may be null. A caller has to have decided what
 * the page looks like without the piece, and for a picture of an answer the
 * answer is already elsewhere on the screen.
 */
export class RenderBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // Said out loud, because the page carries on and nothing else will say it.
  // A part that quietly stops rendering is a bug nobody reports.
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
