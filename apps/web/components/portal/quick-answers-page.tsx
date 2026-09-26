"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Flag,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isOverridden } from "@/components/portal/animal-draft";
import { portalMetaLine } from "@/components/portal/animal-meta";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { EditorBreadcrumb, PinnedBar } from "@/components/portal/editor-chrome";
import { Glyph, PortalThumb } from "@/components/portal/glyph";
import { listingInput } from "@/components/portal/listing-draft";
import {
  EditorNotFound,
  FieldError,
  PortalNotice,
  PortalPendingPage,
  listGate,
  sessionGate,
} from "@/components/portal/notice";
import {
  useAddressedShelter,
  usePortal,
} from "@/components/portal/portal-provider";
import {
  fill,
  fillOneOrMany,
  portalText,
} from "@/components/portal/portal-text";
import { Button } from "@/components/portal/portal-button";
import {
  UNKNOWN,
  isAnswer,
  needsAnswers,
  nextOpen,
  questionsFor,
  resumeRound,
  unknownNote,
  type QuickField,
  type QuickPatch,
  type QuickRecord,
} from "@/components/portal/quick-answers";
import { SaveStatusPip } from "@/components/portal/save-status";
import { IDLE, type PortalSaveState } from "@/hooks/portal-list";
import {
  PORTAL_PATH,
  portalAnswersPath,
  slot,
} from "@/hooks/use-portal-session";
import { markKey, useQuickAnswerSaves } from "@/hooks/use-quick-answer-saves";
import { thumbnailUrl } from "@/lib/animal-images";

// The round a tab is working through, so a reload keeps both the animal and
// the count it was at. sessionStorage for the reason the drafts use it: the
// round belongs to this tab and this sitting, not to the next person to open
// the portal in this browser. Keyed by account and shelter, each part encoded
// so neither can be crafted to reach the other's key. Where storage is
// blocked nothing is kept, and a reload starts a new round on the same animal.
const ROUND_PREFIX = "posvoji.portal.odgovori:";

export function roundKey(account: string, shelter: string): string {
  return `${ROUND_PREFIX}${encodeURIComponent(account)}/${encodeURIComponent(shelter)}`;
}

function readRound(account: string, shelter: string): string[] | null {
  const raw = slot(roundKey(account, shelter)).peek();
  if (!raw) return null;
  try {
    const stored: unknown = JSON.parse(raw);
    return Array.isArray(stored) &&
      stored.every((id): id is string => typeof id === "string")
      ? stored
      : null;
  } catch {
    // Something that is not ours under the key. The round starts again from
    // the list.
    return null;
  }
}

function writeRound(account: string, shelter: string, round: string[]): void {
  slot(roundKey(account, shelter)).write(JSON.stringify(round));
}

/**
 * Five answers adopters filter by, asked one animal at a time.
 *
 * The address is /portal/odgovori?zavetisce=<slug>, and &id=<animal> once a
 * round is on an animal. The shelter is checked against the session exactly
 * as the editor page checks it. A crawled shelter's answers are overrides
 * saved through the same hook the list and the editor use; a manual shelter's
 * go through its listing's own full replace, the one its status buttons send.
 */
export function QuickAnswersPage() {
  const params = useSearchParams();
  const {
    session,
    reloadSession,
    account,
    activeShelter,
    manual,
    animals,
    animalState,
    reloadAnimals,
    saveStates,
    save,
    listings,
    listingState,
    reloadListings,
    listingSaveStates,
    listingActions,
    clearLastSaved,
  } = usePortal();

  const slug = params.get("zavetisce");
  const requested = params.get("id");
  // The address decides which shelter the portal is looking at, as it does
  // on the editor page, so Back to the list lands on the same shelter.
  const { known, showing } = useAddressedShelter(slug);

  const noSession = sessionGate(session, reloadSession);
  if (noSession) return noSession;

  if (!slug || !known) {
    return (
      <EditorNotFound
        icon={Flag}
        title={portalText.quickNotFoundTitle}
        lead={portalText.quickNotFoundLead}
      />
    );
  }

  const noList = listGate(
    showing,
    manual ? listingState : animalState,
    manual ? reloadListings : reloadAnimals,
  );
  if (noList) return noList;
  if (!activeShelter || !account) {
    return <PortalPendingPage label={portalText.loading} />;
  }

  // Both saves below clear the provider's note of the last save. The list
  // scrolls to the animal that note names, which is how it takes a shelter
  // back to the card it opened the editor from. A round was opened from the
  // notice at the top of the list, and that is where the list opens again.
  const key = `${account}/${activeShelter.slug}`;
  if (manual) {
    return (
      <QuickAnswers
        key={key}
        account={account}
        shelter={activeShelter.slug}
        requested={requested}
        records={listings}
        saveStates={listingSaveStates}
        photo={(listing) => listing.photos[0]?.url ?? null}
        // A listing has nothing underneath it: whatever it holds is the
        // shelter's own.
        own={(listing, field) => listing[field] !== null}
        send={async (listing, patch) => {
          const saved = await listingActions.update(listing.id, {
            ...listingInput(listing),
            ...patch,
          });
          clearLastSaved();
          return saved;
        }}
      />
    );
  }
  return (
    <QuickAnswers
      key={key}
      account={account}
      shelter={activeShelter.slug}
      requested={requested}
      records={animals}
      saveStates={saveStates}
      photo={(animal) =>
        animal.thumbnailUrl ? thumbnailUrl(animal.thumbnailUrl) : null
      }
      own={isOverridden}
      send={async (animal, patch) => {
        const saved = await save(animal.id, patch);
        clearLastSaved();
        return saved;
      }}
    />
  );
}

function QuickAnswers<R extends QuickRecord>({
  account,
  shelter,
  requested,
  records,
  saveStates,
  photo,
  own,
  send,
}: {
  account: string;
  shelter: string;
  /** The animal the address named when the page opened. */
  requested: string | null;
  records: R[];
  saveStates: Record<string, PortalSaveState>;
  photo: (record: R) => string | null;
  own: (record: R, field: QuickField) => boolean;
  send: (record: R, patch: QuickPatch) => Promise<R | null>;
}) {
  const byId = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );
  // Fixed for the whole visit, so "3 od 42" keeps meaning the same 42 while
  // the answers go in. Read once, which is what the initializer is for: the
  // list is already there when this mounts.
  const [round] = useState(() =>
    resumeRound(readRound(account, shelter), records, requested),
  );
  // The animal on screen, or null once the round is over. The address only
  // follows it, so a step does not wait for a navigation.
  const [current, setCurrent] = useState<string | null>(() => {
    if (requested && round.includes(requested)) return requested;
    const first = nextOpen(round, -1, byId);
    return first === -1 ? null : round[first]!;
  });
  // Set by the first step. The page a shelter opens is read from the top;
  // every animal after it takes the focus and the scroll to itself.
  const [stepped, setStepped] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // A failure the animal already carried when the round arrived at it is not
  // this visit's, and is not said again.
  const [dismissed, setDismissed] = useState<PortalSaveState | null>(() => {
    const state = current ? saveStates[current] : undefined;
    return state?.status === "error" ? state : null;
  });
  const saves = useQuickAnswerSaves(send, own);

  useEffect(() => {
    writeRound(account, shelter, round);
  }, [account, round, shelter]);

  // The address carries the animal, so a reload opens the round on it again.
  // Replaced, not pushed: the steps of a round are not pages, and Back should
  // leave the round rather than walk it backwards one animal at a time. The
  // native call rather than the router's, because nothing about the route
  // changes; Next keeps useSearchParams in step with it.
  useEffect(() => {
    const target = portalAnswersPath(shelter, current);
    if (`${window.location.pathname}${window.location.search}` === target) return;
    window.history.replaceState(null, "", target);
  }, [current, shelter]);

  const index = current === null ? -1 : round.indexOf(current);
  const record = current === null ? undefined : byId.get(current);
  const next = index === -1 ? -1 : nextOpen(round, index, byId);
  const previous = index > 0 ? round[index - 1]! : null;
  const saveState = current ? (saveStates[current] ?? IDLE) : IDLE;
  const failure =
    saveState.status === "error" && saveState !== dismissed ? saveState : null;
  const remaining = records.filter(needsAnswers).length;

  /**
   * Moves the round once what is on its way for this animal has landed. A
   * step taken while a save is out waits for it rather than leaving it to
   * fail behind the shelter's back; a failure keeps the page where the
   * answer was, with the message in the bar.
   */
  async function go(target: string | null) {
    if (waiting || current === null) return;
    if (saves.busy(current)) {
      setWaiting(true);
      const ok = await saves.settled(current);
      setWaiting(false);
      if (!ok) return;
    }
    const arriving = target ? saveStates[target] : undefined;
    setDismissed(arriving?.status === "error" ? arriving : null);
    setCurrent(target);
    setStepped(true);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {/* Nothing typed here waits to be saved, so the way back is never
          held: an answer on its way when the shelter leaves still lands, and
          the list reports it on the animal's row. */}
      <EditorBreadcrumb name={portalText.quickTitle} />

      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {portalText.quickTitle}
        </h1>
        {/* What a tap does, while there is something to tap. The end of the
            round says the public half of it itself. */}
        {record && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {portalText.quickLead}
          </p>
        )}
      </div>

      {record ? (
        <>
          <AnswerCard
            // A different animal is a different card, mounted fresh, which is
            // what takes the focus and the scroll to it.
            key={record.id}
            record={record}
            position={index + 1}
            total={round.length}
            photo={photo(record)}
            saveState={saveState}
            arrived={stepped}
            pending={saves.pending[record.id]}
            unknowns={saves.unknowns}
            own={(field) => own(record, field)}
            onAnswer={(field, choice) => saves.answer(record, field, choice)}
          />
          <QuickBar
            previousDisabled={previous === null || waiting}
            waiting={waiting}
            last={next === -1}
            error={
              failure && <FieldError>{failure.message}</FieldError>
            }
            onPrevious={() => void go(previous)}
            onNext={() => void go(next === -1 ? null : round[next]!)}
          />
        </>
      ) : (
        <RoundOver remaining={remaining} arrived={stepped} />
      )}
    </div>
  );
}

function AnswerCard<R extends QuickRecord>({
  record,
  position,
  total,
  photo,
  saveState,
  arrived,
  pending,
  unknowns,
  own,
  onAnswer,
}: {
  record: R;
  /** Where this animal is in the round, from one. */
  position: number;
  total: number;
  photo: string | null;
  saveState: PortalSaveState;
  /** Mounted by a step rather than by opening the page. */
  arrived: boolean;
  pending: Partial<Record<QuickField, string>> | undefined;
  unknowns: ReadonlySet<string>;
  own: (field: QuickField) => boolean;
  onAnswer: (field: QuickField, choice: string) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const uid = useId();
  const topRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const name = record.name ?? portalText.unnamed;

  // A step replaces the whole card under a hand that is at the foot of the
  // page. The new animal is brought to the top of the screen and its name
  // takes the focus, so a screen reader says whose questions these are now.
  useEffect(() => {
    if (!arrived) return;
    topRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [arrived]);

  return (
    <section aria-labelledby={`${uid}-name`} className="space-y-6">
      <div ref={topRef} className="scroll-mt-4 space-y-3">
        {/* The outcome of a save sits on the count's line, which has room for
            it. Beside the name it took width from the line under the name,
            which then wrapped and pushed every row down under the finger
            that had just tapped. */}
        <div className="flex min-h-6 items-center justify-between gap-3">
          <p
            id={`${uid}-progress`}
            className="text-sm font-medium tabular-nums text-muted-foreground"
          >
            {fill(portalText.quickProgress, { index: position, count: total })}
          </p>
          <SaveStatusPip state={saveState} />
        </div>
        <div className="flex items-start gap-3">
          <PortalThumb src={photo} species={record.species} />
          <div className="min-w-0 flex-1 space-y-1">
            <h2
              id={`${uid}-name`}
              ref={headingRef}
              tabIndex={-1}
              // Read with the name when a step moves the focus here, so the
              // count is heard along with whose questions these are.
              aria-describedby={`${uid}-progress`}
              className="min-w-0 wrap-anywhere text-lg font-semibold tracking-tight outline-none"
            >
              {name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {portalMetaLine(record, now)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {questionsFor(record.species).map((question) => {
          const { field } = question;
          const waitingChoice = pending?.[field];
          const picked = unknowns.has(markKey(record.id, field));
          const stored = record[field];
          const shown =
            waitingChoice ??
            (isAnswer(field, stored) ? stored : picked ? UNKNOWN : null);
          // Said only once nothing is on its way, so the line does not
          // describe a value the server has not answered for yet.
          const note =
            waitingChoice === undefined
              ? unknownNote(record, field, own(field), picked)
              : null;
          const noteId = `${uid}-${field}-note`;
          return (
            <div key={field} className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Glyph
                  icon={question.icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                {question.label}
              </p>
              <ChoiceGrid
                label={question.label}
                options={question.options}
                meta={question.meta}
                value={shown}
                // A second tap on the chosen card keeps it. Taking an answer
                // back is what Ne vem is for, and a card that also emptied the
                // row would do the same thing a second way, mostly by accident.
                clearable={false}
                onPick={(choice) => {
                  if (choice !== null) onAnswer(field, choice);
                }}
                disabled={false}
                describedBy={note ? noteId : undefined}
              />
              {note && (
                <p id={noteId} className="text-sm text-muted-foreground">
                  {note === "open"
                    ? portalText.quickUnknownOpen
                    : portalText.quickUnknownPublic}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Nazaj and Naprej, in the place the editor keeps Prekliči and Shrani: pinned
 * to the bottom of a phone screen, where the thumb already is, and at the
 * foot of the column from lg. A failed save is said here for the same reason
 * the editor says it in its bar: this is on screen whichever row was tapped.
 */
function QuickBar({
  previousDisabled,
  waiting,
  last,
  error,
  onPrevious,
  onNext,
}: {
  previousDisabled: boolean;
  /** A step is waiting for this animal's save to land. */
  waiting: boolean;
  /** No animal after this one still misses an answer. */
  last: boolean;
  error: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <PinnedBar>
      <div className="mx-auto max-w-xl space-y-2">
        {error}
        {/* Naprej takes the rest of the row where a thumb has to find it; on
            a wide screen the two sit at the ends of the column instead of
            drawing a bar across it. */}
        <div className="flex gap-2 lg:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={previousDisabled}
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden />
            {portalText.quickPrevious}
          </Button>
          <Button
            type="button"
            disabled={waiting}
            onClick={onNext}
            className="flex-1 lg:min-w-40 lg:flex-none"
          >
            {waiting && <LoaderCircle className="animate-spin" aria-hidden />}
            {last ? portalText.quickFinish : portalText.quickNext}
            {!waiting && <ChevronRight aria-hidden />}
          </Button>
        </div>
      </div>
    </PinnedBar>
  );
}

/** The end of a round, and the way back to the list it was opened from. */
function RoundOver({
  remaining,
  arrived,
}: {
  /** Animals on the shelter's list still missing an answer. */
  remaining: number;
  arrived: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Naprej has just gone with the card it was under, so the focus goes to
  // what took its place instead of falling to the page.
  useEffect(() => {
    if (!arrived) return;
    ref.current?.scrollIntoView({ block: "start" });
    ref.current?.focus({ preventScroll: true });
  }, [arrived]);

  return (
    <div ref={ref} tabIndex={-1} className="scroll-mt-4 outline-none">
      <PortalNotice
        icon={remaining === 0 ? CircleCheckBig : Flag}
        title={
          remaining === 0 ? portalText.quickDoneTitle : portalText.quickEndTitle
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={PORTAL_PATH}>{portalText.backToList}</Link>
          </Button>
        }
      >
        {remaining === 0
          ? portalText.quickDoneLead
          : fillOneOrMany(
              remaining,
              portalText.quickEndOne,
              portalText.quickEndMany,
            )}
      </PortalNotice>
    </div>
  );
}
