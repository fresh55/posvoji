import { Clock } from "lucide-react";

/** Registry hours use the same row on the shelter page and coverage card. */
export function ShelterHours({ hours, label }: { hours: string; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground" data-shelter-hours>
      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="sr-only">{label}: </span>
        <span lang="sl">{hours}</span>
      </span>
    </li>
  );
}
