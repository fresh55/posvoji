import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next registers eslint-plugin-jsx-a11y and turns on six of
    // its rules. This is not one of them, and it is the one that names the
    // fault the about page shipped: aria-hidden prunes a subtree from the
    // accessibility tree and leaves the tab order alone, so a control inside
    // one is a stop that announces nothing. WCAG 4.1.2.
    //
    // It currently flags nothing, and it is honest about what it can flag.
    // The rule reads one JSX element's own attributes, so it sees neither of
    // the two shapes this site actually produced: the cat's focusable element
    // arrives imperatively into a shadow root, and the photo surface pairs
    // aria-hidden with tabIndex={-1}, which the rule counts as not focusable
    // and is right to. e2e/reach.ts is where both are caught, by reading a
    // real browser. This is here for the plain case, the one nobody has
    // written yet.
    files: ["**/*.tsx"],
    rules: {
      "jsx-a11y/no-aria-hidden-on-focusable": "error",
    },
  },

  {
    // @posvoji/schema is zod, and its every export comes through one barrel
    // (packages/schema/src/index.ts), so naming a schema value in client code
    // pulls the whole zod runtime in with it: 287KB before hydration on nearly
    // every page of the export. The enums are the tempting ones, because
    // Species.options looks like a free four-string array.
    //
    // Types are erased, so type imports are unaffected. lib/dataset.ts is
    // exempt because it is server-only: it opens node:fs, so it can never be
    // bundled for the browser, and validating the dataset at build time is the
    // reason the package exists. See lib/species.ts for the replacement.
    files: ["**/*.ts", "**/*.tsx"],
    // Tests are never bundled, so they may name the schema values directly.
    // lib/species.test.ts does exactly that, on purpose, to tie the hand-derived
    // order back to the enum it was read off.
    ignores: ["lib/dataset.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@posvoji/schema",
              importNames: [
                "AdoptionStatus",
                "Animal",
                "AnimalSize",
                "Dataset",
                "EnergyLevel",
                "Sex",
                "Species",
              ],
              allowTypeImports: true,
              message:
                "Import this as a type. A value import pulls zod into the client bundle; for the species list use SPECIES_ORDER from @/lib/species.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
