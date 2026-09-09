import { ChevronDown } from "lucide-react";
import type { Locale } from "@/lib/i18n";

// Same source in both locales: a model credit and its license are not
// translated, only the sentence that follows them is.
const MODEL_URL =
  "https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f";
const MODEL_CREDIT = "Cat [Murdered: Soul Suspect] — mark2580";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const LICENSE_LABEL = "CC BY 4.0";

const copy = {
  sl: {
    trigger: "Avtorstvo modela",
    adapted: "Prilagojeni so oblika, dlaka in animacija.",
  },
  en: {
    trigger: "Model credit",
    adapted: "Shape, coat and animation adapted.",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * The 3D cat on the about page is a modified third-party model. This keeps
 * its credit and license one press away in the footer, closed by default so
 * it does not compete with the links beside it.
 *
 * A native disclosure, and it has to stay one. CC BY 4.0 asks for the credit
 * to be carried with the work, so the credit belongs in the HTML whether or
 * not any script runs. `details` gives that for free: the text ships closed
 * but present, opens with JavaScript off, expands for find-in-page, and
 * prints. A Collapsible was here for a while and unmounts its content while
 * closed, which meant the attribution existed only after a click.
 */
export function ModelCredit({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <details className="group/credit">
      {/* The footer's own small-link grammar, down to the 6px icon gap: this
          renders under the footer's action row, which ends in the repository
          link, and two icon-and-text lines that close to each other with
          different gaps read as a mistake. The overlay stays rather than
          becoming a drawn box: the footer now keeps 24px above this, which is
          clear of the overhang, so this is the isolated control globals.css
          says to overlay. No focus colour here, because globals.css sets
          outline-ring on everything. */}
      <summary className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 max-lg:tap-target">
        {text.trigger}
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 transition-transform duration-200 group-open/credit:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <p className="pt-2">
        <a
          href={MODEL_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          {MODEL_CREDIT}
        </a>
        {" · "}
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          {LICENSE_LABEL}
        </a>
        {". "}
        {text.adapted}
      </p>
    </details>
  );
}
