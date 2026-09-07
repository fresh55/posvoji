// How many cards the first render draws. The grid is not paginated, so Vse
// used to mount all 503 matches at once: about fourteen thousand nodes, a
// thousand tab stops and a 66,000px page, all of it in the prerendered HTML as
// well. Sixty is several screens on the tallest phone and more than a desktop
// first paint can show, and the steps after it are asked for well before
// anyone reaches the bottom.
//
// Rendering only. Every count on the page, the facet numbers and the dialog's
// sibling list all still read the whole filtered set.
export const INITIAL_CARDS = 60;

// How far below the last drawn card the next step is asked for, so the grid is
// already longer by the time the visitor gets there.
export const STEP_MARGIN = "1200px 0px";

// What each automatic step adds, and how far the grid goes on its own before
// it starts asking. Unbounded, the sentinel re-armed 1200px ahead of the
// reader every time, so the document grew faster than anyone could descend it
// and the footer, which is the only way to any other page, could not be
// scrolled to at all. Once the budget is spent the sentinel gives way to a
// button, and the footer stands one press below whatever is drawn.
//
// Both figures are rows and not cards, because a row is what scroll distance
// is made of: one measures 300 to 330px here, and a card count says nothing
// about how many rows it becomes. The budget used to be a card count with a
// phone figure and a desktop figure, on the reasoning that 120 cards over two
// columns and 180 over four come out about the same length. Measured across
// thirteen viewports on 28 August 2026 they did not: the footer sat anywhere
// from 9,200px to 19,700px down the page at settle, entirely according to how
// many columns the viewport happened to draw. Counting rows makes the one
// number that matters the same everywhere.
//
// The column count is measured off the rendered grid rather than read from a
// breakpoint of its own, so there is no second copy of CARD_GRID's layout
// (lib/card-grid.ts) here to drift away from it.
//
// Fifteen rows is also more than the watched band, being some 4,500px even at
// two columns against the 1200px STEP_MARGIN above. That is what stops a step
// from asking for the next one the moment it lands, so the grid grows a step
// at a time as the reader descends. It is not what keeps the observer alive
// across a step: the sentinel's ref re-arms it (watchSentinel below), because
// the browser does not reliably report the leave that used to do the job.
export const ROWS_PER_STEP = 15;

export const TARGET_ROWS = 40;

// What a step adds instead while a dialog stands over the grid. Three rows is
// about twelve cards at four columns. A step lands as one commit, and what
// that commit costs grows with the cards in it: sixty cards mounted behind a
// dialog is work nobody can see, done while the visitor may be dragging the
// dialog's photo fan, where a long task is a dropped frame. Twelve is a
// commit that fits in a frame.
//
// Not measured as a fix for any one hitch. A trace taken on 4 September 2026
// while dragging the fan behind a deep-linked dialog showed one long task,
// and invalidation tracking put it down to Chrome re-evaluating the
// display-locked cards below the fold (card-paint) some two seconds after the
// open, drag or no drag; the grid takes no step at all behind a deep-linked
// dialog, its sentinel being 4,500px down and outside the margin. The small
// stride matters where the grid does step behind a dialog: a visitor who
// scrolled before opening one.
//
// Three rows is deliberately short of the 1200px STEP_MARGIN, so the rule
// above runs the other way here: a small step leaves the sentinel inside the
// watched band, the re-arm delivers another entry, and the grid walks to the
// same TARGET_ROWS budget a dozen cards per task instead of sixty. Nothing is
// held back and nothing pauses, so the dialog's own previous and next arrows,
// which walk the cards that are drawn, keep gaining reach exactly as they do
// with the dialog closed.
export const ROWS_PER_STEP_BEHIND_DIALOG = 3;

// A press is a stronger signal than a scroll, so it buys more. At 120 a full
// unfiltered dataset is three or four presses end to end, without the grid
// ever mounting hundreds of cards nobody asked to see.
export const CARDS_PER_CLICK = 120;

// How many columns the grid is drawing, read off the element that is drawing
// them. A laid-out grid computes gridTemplateColumns to its resolved track
// list, so "245px 245px 245px" is three columns and counting the tracks is the
// whole measurement. Measured at step time rather than held in state, for the
// same reason the media query used to be: a value captured at mount goes stale
// across a rotation or a resize.
//
// Nothing to measure has two answers. jsdom lays out nothing and returns an
// empty string; a grid that is not laid out can also hand back the authored
// repeat() rather than a track list, and the parentheses are how that shows.
export function gridColumns(grid: HTMLElement | null): number {
  const tracks = grid ? getComputedStyle(grid).gridTemplateColumns : "";
  if (!tracks || tracks === "none" || tracks.includes("(")) {
    return FALLBACK_COLUMNS;
  }
  return tracks.trim().split(/\s+/).length;
}

// The card's own link, which is the name link and not simply the first anchor
// in the article. The photo block comes first and its anchor is decorative,
// aria-hidden and out of the tab order (photo-gallery.tsx), so focus moved
// there lands on an element the accessibility tree does not have and the
// reading position a screen reader should resume from is lost.
//
// Found by the marker animal-card.tsx puts on it, the same way the card finds
// the photo frame it hands the dialog. Asking instead for the first anchor
// that is neither aria-hidden nor out of the tab order would describe the
// three anchors a card has today and quietly pick the wrong one the day a
// card grows a fourth above the name.
export function cardLink(card: Element | undefined): HTMLAnchorElement | null {
  return (
    card?.querySelector<HTMLAnchorElement>('[data-slot="card-link"]') ?? null
  );
}

const FALLBACK_COLUMNS = 2;
