# Inter

Vendored so share cards render the same on every machine and in CI. `sharp`
resolves fonts through the system, and neither a developer laptop nor a CI
runner is guaranteed to have Inter installed.

- `Inter-Regular.ttf`, `Inter-SemiBold.ttf`: Inter v20, from Google Fonts.
- Licensed under the SIL Open Font License 1.1, copied to `OFL.txt`.

The web app loads the same family through `next/font/google`, so a typographic
share card and the page it links to are set in one typeface.
