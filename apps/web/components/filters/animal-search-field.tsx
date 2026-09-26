"use client";

import { Search, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commitQuery } from "@/hooks/use-animal-filters";
import { prefetchAnimalDescriptions } from "@/lib/animal-descriptions";
import { MAX_QUERY_LENGTH, tidyQuery } from "@/lib/filters/search";
import { cn } from "@/lib/utils";

/** How long the keys have to rest before the address takes the query. A name
 *  typed at speed is then one write and one redraw of the grid rather than
 *  one per letter. */
export const QUERY_WRITE_DELAY_MS = 250;

/** Marks the field, so the filter sheet can tell an Escape meant for it from
 *  one meant to close the sheet (filter-sheet-content.tsx). */
export const SEARCH_FIELD_ATTRIBUTE = "data-animal-search";

/** What the visitor typed, and whether its write is still waiting on the
 *  keys. */
type Draft = { text: string; waiting: boolean };

/**
 * The search at the head of the filter panel and of the phone's sheet.
 *
 * The address holds the query, so the field reads it from there, and what the
 * visitor types is held here beside it: the address takes a query tidied and
 * a quarter second late, and a field that showed that would eat the space
 * between two words as it was typed. The typed text stands for as long as the
 * address agrees with it, and gives way the moment something else moves the
 * query: the pill, Počisti vse, an undo, the back button.
 *
 * Every way out of the field finishes the write first, so the grid never
 * stands a quarter second behind what the field says: Enter, a blur, and the
 * sheet closing under it. A clear press lands on a clear, since the press has
 * already blurred the field and written what was typed.
 */
export function AnimalSearchField({
  query,
  className,
}: {
  /** The query the address holds. */
  query: string;
  className?: string;
}) {
  const { messages } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // A draft the address has moved away from is dropped while rendering, the
  // way React has state follow a prop, so the next render reads the address.
  const live =
    draft !== null && (draft.waiting || tidyQuery(draft.text) === query)
      ? draft
      : null;
  if (live !== draft) setDraft(live);
  const value = live?.text ?? query;
  const active = value !== "";

  // The write that is waiting, as one object for the field's lifetime, so the
  // unmount below can finish what the timer would have.
  const pending = useRef<{ timer: number; text: string | null }>({
    timer: 0,
    text: null,
  });

  const flush = () => {
    const write = pending.current;
    window.clearTimeout(write.timer);
    if (write.text === null) return;
    const text = write.text;
    write.text = null;
    setDraft((current) => current && { ...current, waiting: false });
    commitQuery(text);
  };

  const edit = (text: string) => {
    setDraft({ text, waiting: true });
    // The descriptions are the one field the grid does not carry. Asked for on
    // the first key, the quarter second the write waits is spent fetching
    // them rather than after it.
    if (text.trim() !== "") void prefetchAnimalDescriptions();
    const write = pending.current;
    window.clearTimeout(write.timer);
    write.text = text;
    write.timer = window.setTimeout(flush, QUERY_WRITE_DELAY_MS);
  };

  // At once, like every clear: there is no more typing to wait for.
  const clear = () => {
    const write = pending.current;
    window.clearTimeout(write.timer);
    write.text = null;
    setDraft(null);
    commitQuery("");
  };

  // The sheet can close with a write still waiting; it goes through rather
  // than being lost with the field.
  useEffect(() => {
    const write = pending.current;
    return () => {
      window.clearTimeout(write.timer);
      if (write.text !== null) commitQuery(write.text);
      write.text = null;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      // An empty field leaves the key to whatever holds it: the sheet closes.
      if (!active) return;
      // Chrome and Safari empty a search field on Escape by themselves, and
      // that arrives as typing, a quarter second late.
      event.preventDefault();
      clear();
      return;
    }
    if (event.key === "Enter") {
      flush();
      // On a phone the keyboard covers the list the key was pressed to see.
      if (window.matchMedia?.("(pointer: coarse)").matches) {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div role="search" className={cn("relative", className)}>
      {/* Green while a query is on, the colour a picked card and every pill's
          mark wear: it says this is filtering without another word. */}
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 transition-colors",
          active ? "text-brand-strong" : "text-muted-foreground",
        )}
      />
      <Input
        ref={inputRef}
        {...{ [SEARCH_FIELD_ATTRIBUTE]: "" }}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_QUERY_LENGTH}
        aria-label={messages.searchAnimals}
        placeholder={messages.searchPlaceholder}
        value={value}
        onChange={(event) => edit(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={flush}
        className={cn(
          // 40px beside the rail's other controls, and the primitive's 44 on
          // a coarse pointer. 16px type until lg, which is where the sheet
          // ends and the rail starts: iOS zooms the page onto a field set any
          // smaller. md:text-base beats the primitive's own md:text-sm.
          "h-10 pl-9 text-base shadow-none md:text-base lg:text-sm",
          // Chrome and Safari draw a clear of their own; this one is ours.
          "[&::-webkit-search-cancel-button]:appearance-none",
          // Room for the clear only while it is there: the rail is 224px, and
          // the English placeholder needs most of it.
          active
            ? "border-brand-border pr-10 pointer-coarse:pr-11"
            : "pr-3",
        )}
      />
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={messages.clearField}
          // The field keeps focus through the press, so the blur does not
          // write the text this is about to clear.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            clear();
            inputRef.current?.focus();
          }}
          className="absolute top-0 right-0 text-muted-foreground pointer-coarse:size-11"
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
