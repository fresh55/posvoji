# Shelter logos supplied to us

Artwork a shelter handed us rather than published. Every other logo on the
site is fetched from the shelter's own site at the URL pinned in
`providers/<slug>/policy.yaml`, and the cached copy is gitignored, because a
shelter's mark is its content and not this repository's. These files are here
because there is no URL to fetch:

- the shelter has no website, or
- the only thing it publishes is a banner with a phone number burnt into it.

A file here is named in its shelter's policy under `logo.file`, and the same
dated grant in that policy is what permits it. `pnpm --filter @posvoji/ingest
fetch:logos` reads it off the disk, trims, resizes and writes the cached copy
the site serves; nothing else reads this directory.

## These files are not covered by the repository's licence

Each one is the trademark of the shelter named in its filename, included with
that shelter's permission and used to identify them on posvoji.si. The
repository's AGPL-3.0 licence covers the code, not these marks. Copying the
repository does not carry any right to use them, and a shelter withdrawing its
permission means deleting the file and clearing `logo.file` from its policy.

Keep this directory to actual marks. A photograph of an animal is not a logo,
and animal photographs are covered by a different grant (`images:`) and cached
somewhere else entirely.
