"use client";

import { type ReactNode } from "react";
import {
  Cake,
  CalendarClock,
  MapPin,
  Mars,
  Ruler,
  Venus,
  type LucideIcon,
} from "lucide-react";
import type { Animal, Sex } from "@posvoji/schema";
import { useI18n } from "@/components/i18n-provider";
import { HEALTH_ICONS, SPECIES_ICONS } from "@/lib/animal-icons";
import { ageInMonths, TOGGLES, toggleLabel } from "@/lib/filters";
import { ageLabel, sexLabel, sizeLabel, timeInShelter } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SEX_ICONS: Record<Exclude<Sex, "unknown">, LucideIcon> = {
  male: Mars,
  female: Venus,
};

// The icon carries the meaning on screen; a screen reader gets the same
// meaning from the prefix instead. Facts that read as a full sentence on their
// own (the sex, the municipality) need no prefix.
function Fact({
  icon: Icon,
  prefix,
  className,
  children,
}: {
  icon: LucideIcon;
  prefix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-ui border bg-muted/40 px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
      {prefix && <span className="sr-only">{prefix}: </span>}
      <span>{children}</span>
    </li>
  );
}

export function AnimalFacts({
  animal,
  reference,
}: {
  animal: Animal;
  /** The dataset's own build time, so every span agrees with the cards. */
  reference: Date;
}) {
  const { locale, messages, t } = useI18n();
  const months = ageInMonths(animal, reference);
  const shelterTime = animal.intakeDate
    ? timeInShelter(animal.intakeDate, locale, reference)
    : undefined;
  const sex = animal.sex && animal.sex !== "unknown" ? animal.sex : undefined;
  const medical = TOGGLES.filter((toggle) => toggle.matches(animal));

  return (
    <div className="space-y-3">
      <ul
        aria-label={messages.animalDetails}
        className="flex flex-wrap gap-2 empty:hidden"
      >
        {animal.breed && (
          <Fact icon={SPECIES_ICONS[animal.species]} prefix={messages.factBreed}>
            {animal.breed}
          </Fact>
        )}
        {sex && <Fact icon={SEX_ICONS[sex]}>{sexLabel(sex, locale)}</Fact>}
        {months !== undefined && (
          <Fact icon={Cake} prefix={messages.factAge}>
            {ageLabel(months, locale)}
          </Fact>
        )}
        {animal.size && (
          <Fact icon={Ruler} prefix={messages.factSize}>
            {sizeLabel(animal.size, locale)}
          </Fact>
        )}
        {shelterTime && (
          <Fact icon={CalendarClock} prefix={messages.factTimeInShelter}>
            {shelterTime}
          </Fact>
        )}
        {animal.originMunicipality && (
          <Fact icon={MapPin}>
            {t("factOrigin", { municipality: animal.originMunicipality })}
          </Fact>
        )}
        {medical.map(({ key }) => (
          <Fact
            key={key}
            icon={HEALTH_ICONS[key]}
            className="border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
          >
            {toggleLabel(key, locale)}
          </Fact>
        ))}
      </ul>

      {animal.shortDescription && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {animal.shortDescription}
        </p>
      )}
    </div>
  );
}
