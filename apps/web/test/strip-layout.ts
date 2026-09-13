/**
 * A fake layout for a sideways-scrolling strip, because jsdom lays nothing out
 * and answers every rectangle and every scroll number with zero, which leaves
 * the scrolling in lib/scroll-strip.ts nothing to react to.
 *
 * Not a `.test.` file, so vitest does not collect it. Two suites need this
 * (the species tabs and the active filters row) and they need the same model,
 * so it is written once rather than twice: the pointer builder next door
 * records what four drifting copies of one helper cost.
 *
 * The model: the strip stands at viewport x=0 and is `boxWidth` wide, items
 * are `itemWidth` wide in document order, and the strip's own scrollLeft
 * slides them under it. Rectangles rather than offsetLeft, because that is
 * what the helper reads and why it reads it (lib/scroll-strip.ts).
 *
 * Installed on the prototypes rather than on the elements: the effects these
 * tests are about run on mount, so the numbers have to be readable before any
 * of the elements exist.
 */
export function fakeStripLayout({
  itemSelector,
  itemWidth = 100,
  boxWidth = 220,
}: {
  /** What counts as an item of the strip, as a selector inside it. */
  itemSelector: string;
  itemWidth?: number;
  boxWidth?: number;
}) {
  const offsets = new WeakMap<Element, number>();
  const writes: number[] = [];
  const saved: {
    proto: object;
    name: string;
    descriptor: PropertyDescriptor | undefined;
  }[] = [];

  const define = (proto: object, name: string, next: PropertyDescriptor) => {
    saved.push({
      proto,
      name,
      descriptor: Object.getOwnPropertyDescriptor(proto, name),
    });
    Object.defineProperty(proto, name, { configurable: true, ...next });
  };

  const isStrip = (el: Element) => el.hasAttribute("data-scroll-strip");
  const stripOf = (el: Element) => el.closest("[data-scroll-strip]");

  /** Where an item sits in its strip, or -1 for anything that is not one. */
  const slotOf = (el: Element) => {
    const strip = stripOf(el);
    if (!strip || strip === el) return -1;
    return [...strip.querySelectorAll(itemSelector)].indexOf(el);
  };

  const rect = (left: number, width: number) =>
    ({
      x: left,
      y: 0,
      left,
      right: left + width,
      top: 0,
      bottom: 0,
      width,
      height: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  define(Element.prototype, "getBoundingClientRect", {
    value(this: Element) {
      if (isStrip(this)) return rect(0, boxWidth);
      const slot = slotOf(this);
      if (slot < 0) return rect(0, 0);
      const strip = stripOf(this);
      const scrolled = strip ? (offsets.get(strip) ?? 0) : 0;
      return rect(slot * itemWidth - scrolled, itemWidth);
    },
  });
  define(Element.prototype, "clientWidth", {
    get(this: Element) {
      return isStrip(this) ? boxWidth : 0;
    },
  });
  define(Element.prototype, "scrollWidth", {
    get(this: Element) {
      return isStrip(this)
        ? this.querySelectorAll(itemSelector).length * itemWidth
        : 0;
    },
  });
  define(Element.prototype, "scrollLeft", {
    get(this: Element) {
      return offsets.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      offsets.set(this, value);
      if (isStrip(this)) writes.push(value);
    },
  });

  return {
    /** Every scrollLeft a strip was given, in order. */
    writes,
    /** Where a strip stands now, however it got there. */
    at: (strip: Element) => offsets.get(strip) ?? 0,
    /** Put a strip somewhere without counting it as a write. */
    seed: (strip: Element, left: number) => offsets.set(strip, left),
    restore: () => {
      for (const { proto, name, descriptor } of saved.reverse()) {
        if (descriptor) Object.defineProperty(proto, name, descriptor);
        else delete (proto as Record<string, unknown>)[name];
      }
    },
  };
}
