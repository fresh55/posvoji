# Srečko's memorial

The About page links to a separate memorial at `/o-nas/srecko` and
`/en/about/srecko`. He is not an entry in the active adoption dataset.

## Updating his story

Edit `apps/web/lib/srecko.ts`. Use only facts confirmed by his owner.

- `SRECKO.memory` accepts a short, genuine memory in Slovenian and English.
  Leave it undefined until the owner supplies one.
- `SRECKO.timeline` accepts YYYY, YYYY-MM or YYYY-MM-DD dates. Undated and
  invalid milestones are omitted. Time at home is shown as the supplied date
  range, preserving its precision; no exact duration is inferred from a year.
- `SRECKO.photos` holds approved local photographs. Obtain permission,
  remove EXIF, resize the longest edge to at most 1600px, and inspect the
  background for personal information before adding a file under public/.
  Supply width, height and meaningful alt text in both languages.
- The first photograph becomes the main memorial image and the poster image.
  The gallery presents the first photograph at full width.
- `SRECKO_TEXT` holds the shared memorial, poster and preview wording.

Do not infer personality, medical history, dates, or historical site rankings.
The illustration is the fallback if the approved photograph list is empty.

## Recorded sources

- The owner supplied Mačja hiša as his shelter and the memory "zelo igrivi
  fant" in this task on 2026-09-08. The short memory is translated into English.
- User-supplied screenshots of Mačja hiša posts dated 2023-03-16 and
  2023-03-18 establish that he came home on 2023-03-17: the first announces
  departure the following day; the second confirms it happened the previous
  afternoon. The milestone says "Came home" to describe that evidence.
  Shelter arrival and death dates remain unknown.
- The screenshots were read as supplied; no social platform was fetched or
  scraped, and the screenshots are not stored in this repository.
- On 2026-09-08, the owner confirmed in this task that the supplied photographs
  are theirs and explicitly permitted their use on Posvoji.si. This is the
  permission for the four files under `apps/web/public/images/srecko/`,
  separate from Mačja hiša's website-catalogue permission. Credit is
  "Photos: personal archive, used with permission"; no public reuse licence
  is implied.
- Five attachments repeated one portrait; it is included once. The other
  three photographs show Srečko watching television, resting, and looking at
  a toy. The collage photograph containing an identifiable person is excluded.
  Prepared images contain only the original cat photographs, without social
  interface, comments, EXIF, XMP or IPTC. They retain the supplied resolution
  (612×570 portrait; approximately 305×305 home pictures), without upscaling
  or generated detail. Original-resolution files can replace these later.

## Share cards

`pnpm --filter web generate:srecko-share` generates four 1200×630 JPEGs:
About and memorial, each in Slovenian and English. The web build runs this
automatically. Commit regenerated cards along with content or image changes.

The memorial card follows the first approved photograph. About keeps its
illustrated companion. Render credit appears only when the illustration is
used. The generator uses the repository's Inter fonts and Sharp, runs offline,
and requires no Chrome executable or system font installation.

## Cat interaction

The branch includes the interaction and attention modules, their unit tests,
the model and matching still. The dedicated cat browser suite and its
measurements are documented in `docs/CAT-HARDENING.md`.

A quiet dedication beneath the model links to the memorial in both languages.
It stays visible while loading and when the still-image fallback is used.
Keyboard guidance remains available through the model's accessible prompt.
Animation respects reduced motion and pauses when the cat is offscreen or
the tab is hidden.

## Local checks on Windows

Run the repository's normal `pnpm check`. The shell checks expect Git Bash;
if Windows resolves `bash` to WSL, put Git's bin directory first in PATH for
the current terminal. This does not require changing WSL or repository scripts.
