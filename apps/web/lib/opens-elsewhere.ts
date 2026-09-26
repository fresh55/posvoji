/** A press that opens the link somewhere other than this tab: a held modifier,
 *  or a button other than the primary one. Every link here that answers a plain
 *  press in place (a grid card opening the dialog, the dialog's steps, a
 *  gallery photo, the portal's guarded breadcrumb) leaves these to the browser,
 *  because the visitor asked it for a new tab or window. One copy, so that a
 *  change to what counts reaches all of them. */
export function opensElsewhere(
  event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
): boolean {
  return (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  );
}
