"use client";

import { useCallback } from "react";
import type { ClientAnimal } from "@/lib/animal";
import type { PermittedPhoto } from "@/lib/animal-images";
import { useClientPayload } from "./use-client-payload";

function validPhoto(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const photo = value as Partial<PermittedPhoto>;
  if (typeof photo.src !== "string") return false;
  if (
    photo.widths &&
    (!Array.isArray(photo.widths) ||
      !photo.widths.every((width) => Number.isFinite(width) && width > 0))
  ) {
    return false;
  }
  if (
    photo.aspect !== undefined &&
    (!Number.isFinite(photo.aspect) || photo.aspect <= 0)
  ) {
    return false;
  }
  if (
    photo.subject !== undefined &&
    (!Array.isArray(photo.subject) ||
      photo.subject.length !== 4 ||
      !photo.subject.every(Number.isFinite))
  ) {
    return false;
  }
  return true;
}

export function useAnimalPhotos(animal: ClientAnimal, active = false) {
  const expectedCount = animal.gallery?.count;
  const validate = useCallback(
    (data: unknown[]) =>
      data.length === expectedCount && data.every(validPhoto),
    [expectedCount],
  );
  const payload = useClientPayload<PermittedPhoto[]>(
    animal.gallery?.url,
    active,
    validate,
  );

  return {
    ...payload,
    images: payload.data ?? animal.images,
    count: expectedCount ?? animal.images.length,
    ready: !animal.gallery || !!payload.data,
  };
}
