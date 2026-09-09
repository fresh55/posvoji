# model-viewer 4.3.1

The patch is installed by pnpm, including frozen-lockfile installs. Next uses
the package's `lib` entry; matching `src` changes keep upstream source references
readable. Prebuilt `dist` bundles are not used or patched.

- Backport [#5178](https://github.com/google/model-viewer/pull/5178): valid
  numeric animation repetition counts must not warn. Invalid low counts still
  warn and clamp as before.
- Backport [#5182](https://github.com/google/model-viewer/pull/5182): remove
  leftover model loading and intersection debug logs.
- Coalesce camera jumps after `updateComplete`, instead of requesting another
  Lit update from style synchronization inside `updated()`. The camera still
  settles after property updates, with one jump per pending batch.

Remove the backports when upgrading to a release containing them; recheck the
camera scheduling fix against that release. Verify initial framing, keyboard
orbit, reactions, offscreen/reduced-motion pausing and development console
warnings. Do not replace this with global console suppression.
