import { MessageCircleQuestionMark } from "lucide-react";
import Link from "next/link";
import { fill, portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/portal/portal-button";
import { portalAnswersPath } from "@/hooks/use-portal-session";
import { pick } from "@/lib/labels";

/**
 * The way into the quick answers: one line saying how many animals still
 * miss one of the answers adopters filter by most, and one button. Gone once
 * there are none, so the list starts where the tools end.
 *
 * A link, not a button that opens something: the round is a page of its own,
 * with an address a reload comes back to.
 */
export function QuickAnswersNotice({
  count,
  shelter,
}: {
  /** Animals of the active shelter the round would ask something. */
  count: number;
  shelter: string;
}) {
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-ui border bg-muted/30 px-3 py-2.5 text-sm">
      {/* A basis of its own, so on a phone the button goes under the line
          rather than squeezing it into a column one word wide. */}
      <p className="min-w-0 grow basis-64 text-muted-foreground">
        {fill(
          pick(count, [
            portalText.quickNoticeOne,
            portalText.quickNoticeMany,
            portalText.quickNoticeMany,
            portalText.quickNoticeMany,
          ]),
          { count },
        )}
      </p>
      <Button asChild size="sm">
        {/* next/link, so the session and the list stay in memory behind the
            round, as they do behind the editor. */}
        <Link href={portalAnswersPath(shelter)}>
          <MessageCircleQuestionMark aria-hidden />
          {portalText.quickNoticeAction}
        </Link>
      </Button>
    </div>
  );
}
