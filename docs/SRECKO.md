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
The current illustration remains until an approved photograph is available.

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
the model and matching still. The source worktree's separate experimental
browser-test harness is not required by these pages.

The short visible hint is followed by optional detailed instructions.
Animation respects reduced motion and pauses when the cat is offscreen or
the tab is hidden.

## Local checks on Windows

Run the repository's normal `pnpm check`. The shell checks expect Git Bash;
if Windows resolves `bash` to WSL, put Git's bin directory first in PATH for
the current terminal. This does not require changing WSL or repository scripts.
