/**
 * What the API takes. One list, because the picker's own check and the file
 * input's accept attribute have to agree: a type the input offers and the
 * check refuses is a file the shelter can pick and then be told off for.
 */
export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** A file picked for a listing and not stored yet. */
export type PendingPhoto = {
  key: number;
  file: File;
  /** An object URL of the file, revoked once the file is stored or dropped. */
  previewUrl: string;
  failed: boolean;
};
