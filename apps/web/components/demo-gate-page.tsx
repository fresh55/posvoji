"use client";

import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CatModel, type CatModelHandle } from "@/components/cat-model";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mailtoHref } from "@/lib/contact-links";
import { isGatedView, readGateCookie, writeGateCookie } from "@/lib/demo-gate";
import type { Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { HOME_PATHS } from "@/lib/shelter-path";
import { CONTENT_ID } from "@/lib/skip-link";
import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

const copy = {
  sl: {
    title: "Dostop za zavetišča",
    lead: "Posvoji.si je v zaprtem predogledu.",
    label: "Geslo iz povabila",
    submit: "Vstopi",
    wrong: "Geslo ni pravilno.",
    empty: "Vnesite geslo.",
    noPassword: "Nimate gesla?",
    write: "Pišite nam",
    show: "Pokaži geslo",
    hide: "Skrij geslo",
    other: { label: "English", href: HOME_PATHS.en },
  },
  en: {
    title: "Access for shelters",
    lead: "Posvoji.si is in a closed preview.",
    label: "Password from your invitation",
    submit: "Enter",
    wrong: "The password is not correct.",
    empty: "Enter the password.",
    noPassword: "No password?",
    write: "Write to us",
    show: "Show password",
    hide: "Hide password",
    other: { label: "Slovensko", href: HOME_PATHS.sl },
  },
} satisfies Record<Locale, unknown>;

/** How long the cat gets to answer a right password before the page turns over. */
const GREETING_MS = 900;

const subscribeNothing = () => () => {};

/**
 * The page a visitor meets while the site is open to invited shelters only.
 *
 * Caddy serves it as the body of a 401 at whatever address was asked for, and
 * it is also its own route so a link can point at it. What it does is small:
 * put the typed password in a cookie and ask again. Caddy decides; the page
 * only learns the answer from being shown once more with the cookie still
 * set, which is how it knows to say the password was wrong.
 *
 * Both routes carry robots: noindex. This is the body Caddy gives a refused
 * request while the gate is up, and it stops meaning anything once the gate
 * comes off.
 */
export function DemoGatePage({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [password, setPassword] = useState("");
  const [blank, setBlank] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // A password shared by a whole shelter is typed from a note, and the one
  // thing that helps a note is seeing what was typed.
  const [shown, setShown] = useState(false);
  const cat = useRef<CatModelHandle | null>(null);
  // A wrong password is known on mount, before the model has loaded. The
  // objection waits here until the cat can make it.
  const objection = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // Shown again at a refused address with the cookie already set: the value
  // in it was refused. The export has no location, so the server snapshot is
  // "not refused" and the browser answers once it hydrates.
  // Read once per page: the cookie is cleared right after, and a snapshot
  // that changed under React would be read as a store update.
  const refusedOnLoad = useRef<boolean>(undefined);
  const refused = useSyncExternalStore(
    subscribeNothing,
    () => (refusedOnLoad.current ??= isGatedView(location.pathname) && readGateCookie() !== ""),
    () => false,
  );
  const error = blank ? "empty" : refused && !password ? "wrong" : null;

  useEffect(() => {
    // Drop the refused value so a plain reload stops repeating the news.
    if (refused) writeGateCookie("");
  }, [refused]);

  useEffect(() => {
    if (error !== "wrong") return;
    objection.current = !cat.current?.react("Back warning");
  }, [error]);

  // Stable, so a keystroke does not re-render the memoised model.
  const takeHandle = useCallback((handle: CatModelHandle | null) => {
    cat.current = handle;
    if (handle && objection.current) objection.current = !handle.react("Back warning");
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (leaving) return;
    const value = password.trim();
    if (!value) {
      setBlank(true);
      input.current?.focus();
      return;
    }
    writeGateCookie(value);
    setLeaving(true);
    const go = () => {
      if (isGatedView(location.pathname)) location.reload();
      else location.assign(HOME_PATHS[locale]);
    };
    // Let the cat answer before the page turns over. A wrong password comes
    // back as this page again, so nothing is lost by waiting either way.
    if (cat.current?.react("Paw hello")) setTimeout(go, GREETING_MS);
    else go();
  };

  return (
    // The frame error-page.tsx spells out, and for the same reason: there is
    // no layout to inherit it from, and site-shell.tsx would bring a header
    // and a footer this page has no use for.
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
      <main id={CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col items-center justify-center py-page-y">
        {/* Three groups, one gap between them, and each group owns its own
            inner spacing. One scale rather than a chain of margins is what
            keeps "greeting, the thing to do, the way out" readable as three
            steps instead of six loose lines. */}
        <div className="flex w-full max-w-md flex-col items-center gap-10">
          <div className="flex w-full flex-col items-center gap-5 text-center">
            <a
              href={HOME_PATHS[locale]}
              className={cn(
                "inline-flex items-center gap-2 rounded-ui text-lg font-semibold",
                "focus-visible:outline-2 focus-visible:outline-offset-4",
              )}
              aria-label="posvoji.si"
            >
              <Logo className="h-8 w-auto shrink-0" />
              <span>posvoji.si</span>
            </a>
            {/* The cat is the page. He gets the vertical room; everything
                else is one line of type and one field. */}
            <figure className="w-full">
              <CatModel
                locale={locale}
                className="h-56 sm:h-72"
                sizes="(min-width: 640px) 448px, 100vw"
                posterPriority
                onHandle={takeHandle}
              />
            </figure>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {text.title}
              </h1>
              <p className="text-sm text-pretty text-muted-foreground sm:text-base">
                {text.lead}
              </p>
            </div>
          </div>

          {/* Left aligned on purpose, against the centred block above: a
              label belongs over the field it names, not over the middle. */}
          <form onSubmit={submit} noValidate className="w-full space-y-2 text-left">
            <Label htmlFor="demo-password">{text.label}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  ref={input}
                  id="demo-password"
                  name="password"
                  type={shown ? "text" : "password"}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setBlank(false); }}
                  aria-invalid={error !== null || undefined}
                  aria-describedby="demo-password-error"
                  disabled={leaving}
                  className="h-11 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={shown ? text.hide : text.show}
                  aria-pressed={shown}
                  onClick={() => setShown((value) => !value)}
                  disabled={leaving}
                  className="absolute inset-y-0 right-0 size-11 text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
              <Button type="submit" disabled={leaving} className="h-11 sm:px-8">
                {text.submit}
              </Button>
            </div>
            {/* One line of room is always reserved. An error that appears
                must not push the button out from under the pointer. */}
            <p
              id="demo-password-error"
              role="alert"
              className="min-h-5 text-sm text-destructive"
            >
              {error === "wrong" ? text.wrong : error === "empty" ? text.empty : ""}
            </p>
          </form>

          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>
              {text.noPassword}{" "}
              <a href={mailtoHref(CONTACT_EMAIL)} className={cn(MUTED_LINK, "underline")}>
                {text.write}
              </a>
            </span>
            <span aria-hidden>·</span>
            <a
              href={text.other.href}
              hrefLang={locale === "sl" ? "en" : "sl"}
              className={cn(MUTED_LINK, "underline")}
            >
              {text.other.label}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
