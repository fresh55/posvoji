import { FieldError } from "@/components/portal/notice";
import { choiceCard, hintId } from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import { type PortalListingPhoto } from "@/lib/portal-api";
import { cn } from "@/lib/utils";
import { ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import type { ChangeEvent } from "react";
import { ACCEPTED_PHOTO_TYPES, type PendingPhoto } from "./listing-photo-rules";

/** Everything the photo section draws and everything a tap on it reaches. */
export type PhotoPanel = {
  /** The photos the API has, in its own order. */
  stored: PortalListingPhoto[];
  pending: PendingPhoto[];
  uploading: { index: number; total: number } | null;
  /** A refused file, or a remove that did not go through. */
  error: string | null;
  errorId: string;
  /** The stored photo whose Odstrani is waiting for its second tap. */
  removing: number | null;
  busy: boolean;
  /**
   * Whether a pending file has somewhere to go yet. A listing that has not
   * been saved has no id for the photo route, so its files wait as previews.
   */
  storable: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRetry: (item: PendingPhoto) => void;
  onDrop: (item: PendingPhoto) => void;
  onRemove: (photoId: number) => void;
};

/**
 * The photos, stored and picked alike, in one grid with the picker at its end.
 *
 * Its own section, because it is the one part of the form that talks to the
 * network on its own: on a saved listing a picked file is stored the moment it
 * is picked, and every state of that has to be readable.
 */
export function Photos({ uid, panel }: { uid: string; panel: PhotoPanel }) {
  const fileId = `${uid}-file`;

  return (
    <div data-field="photos" className="space-y-1.5">
      <div data-field-control>
        <div
          role="group"
          aria-label={portalText.fieldPhotos}
          aria-describedby={hintId(uid, "photos")}
          className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
        >
          {panel.stored.map((photo, index) => {
            const confirm = panel.removing === photo.id;
            return (
              <figure key={photo.id} className="space-y-1">
                {/* The API host is not one next/image knows, and the stored
                    copy is already capped at 2048px. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  width={photo.width}
                  height={photo.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full rounded-ui border bg-muted/40 object-cover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={panel.busy}
                  aria-label={
                    confirm
                      ? undefined
                      : fill(portalText.photoRemoveLabel, {
                          index: index + 1,
                        })
                  }
                  onClick={() => panel.onRemove(photo.id)}
                  className={cn(
                    "w-full font-normal text-muted-foreground hover:text-foreground",
                    confirm && "text-destructive hover:text-destructive",
                  )}
                >
                  {confirm
                    ? portalText.photoRemoveConfirm
                    : portalText.photoRemove}
                </Button>
              </figure>
            );
          })}

          {panel.pending.map((item) => (
            <figure key={item.key} className="space-y-1">
              {/* A local object URL; nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt=""
                className={cn(
                  "aspect-square w-full rounded-ui border bg-muted/40 object-cover",
                  !item.failed && "opacity-60",
                )}
              />
              {item.failed ? (
                <div className="space-y-1">
                  <p
                    role="alert"
                    className="text-2xs leading-tight text-destructive"
                  >
                    {fill(portalText.photoUploadFailed, {
                      name: item.file.name,
                    })}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={panel.busy || !panel.storable}
                      onClick={() => panel.onRetry(item)}
                      className="flex-1"
                    >
                      <RefreshCw aria-hidden />
                      {portalText.photoRetry}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={panel.busy}
                      onClick={() => panel.onDrop(item)}
                      className="font-normal text-muted-foreground hover:text-foreground"
                    >
                      {portalText.photoRemove}
                    </Button>
                  </div>
                </div>
              ) : panel.storable ? (
                <p className="text-center text-2xs text-muted-foreground">
                  {portalText.photoPending}
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={panel.busy}
                  onClick={() => panel.onDrop(item)}
                  className="w-full font-normal text-muted-foreground hover:text-foreground"
                >
                  {portalText.photoRemove}
                </Button>
              )}
            </figure>
          ))}

          {/* The picker is an icon card like every other choice in the form.
              The input itself is what takes the focus, so the card draws the
              ring for it. */}
          <label
            htmlFor={fileId}
            className={choiceCard(
              false,
              cn(
                "aspect-square cursor-pointer flex-col gap-1 self-start px-1.5 py-1.5 text-center text-xs leading-tight font-medium focus-within:border-ring focus-within:ring-3 focus-within:ring-ring",
                panel.busy && "pointer-events-none opacity-50",
              ),
            )}
          >
            <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
            <span>{portalText.photoAdd}</span>
            <input
              id={fileId}
              type="file"
              accept={ACCEPTED_PHOTO_TYPES.join(",")}
              multiple
              disabled={panel.busy}
              aria-describedby={hintId(uid, "photos")}
              onChange={panel.onPick}
              className="sr-only"
            />
          </label>
        </div>
        {panel.uploading && (
          <p
            aria-live="polite"
            className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {fill(portalText.photoUploading, panel.uploading)}
          </p>
        )}
      </div>
      {panel.error && <FieldError id={panel.errorId}>{panel.error}</FieldError>}
      <p id={hintId(uid, "photos")} className="text-xs text-muted-foreground">
        {portalText.photosHint} {portalText.photoLimits}
      </p>
    </div>
  );
}
