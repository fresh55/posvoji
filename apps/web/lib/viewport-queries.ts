/**
 * The viewport questions both CSS and JS ask, written once.
 *
 * A leaf on purpose, the same shape as lib/date-label.ts: the picker's motion
 * module and the animal dialog's fan both need the short-viewport cutoff, and
 * importing one component's module from the other would pull that component's
 * code into the other's bundle for the sake of a string.
 */

/** The same cutoff as globals.css's `short` variant. */
export const SHORT_VIEWPORT_QUERY = "(max-height: 32rem)";

/** Whether the visitor has asked for less movement, which is the question every
 *  motion gate on the site starts with. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The viewport that gets the phone shell: a narrow window, or a short one. A
 * phone held sideways is 844x390, wide enough for the desktop box and far too
 * short for it, so height counts as much as width.
 */
export const PHONE_SHELL_QUERY = `(max-width: 639px), ${SHORT_VIEWPORT_QUERY}`;

/**
 * Its exact complement, and the reason this is derived rather than typed out.
 * Written as `min-height: 32rem` the desktop side matched at exactly 512px
 * tall, and so did the phone side's `max-height: 32rem`: a viewport on the
 * line took the phone shell and put the desktop fan inside it. `not` around
 * the one condition cannot drift that way.
 */
export const DESKTOP_SHELL_QUERY = `(min-width: 640px) and (not ${SHORT_VIEWPORT_QUERY})`;
