import Image from "next/image";
import type { Animal } from "@posvoji/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { animalMeta } from "@/lib/labels";

/** Only images the shelter has actually permitted are ever rendered. */
function permittedImage(animal: Animal): string | undefined {
  for (const image of animal.images) {
    if (image.rights === "cache-permitted") return image.cachedUrl ?? image.sourceUrl;
    if (image.rights === "display-permitted") return image.sourceUrl;
  }
  return undefined;
}

export function AnimalCard({ animal }: { animal: Animal }) {
  const image = permittedImage(animal);

  return (
    <a
      href={animal.source.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-lg border transition-colors hover:border-foreground/25"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-muted">
        {image ? (
          <Image src={image} alt={animal.name ?? ""} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Fotografija na strani zavetišča
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium">{animal.name ?? "Brez imena"}</h3>
          {animal.status === "reserved" && (
            <span className="shrink-0 text-xs text-muted-foreground">rezerviran</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{animalMeta(animal)}</p>
        <p className="truncate text-xs text-muted-foreground/80">{animal.shelter.name}</p>
      </div>
    </a>
  );
}

/** Same shape as the card above — the placeholder while the index is empty. */
export function AnimalCardSkeleton() {
  return (
    <div className="rounded-lg border">
      <Skeleton className="aspect-[4/3] rounded-b-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
