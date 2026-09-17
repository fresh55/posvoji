"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { clampPhotoIndex, photoFromSearch } from "@/lib/animal-path";
import {
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToLocation,
} from "@/lib/location-search";

const PhotoSelection = createContext<{
  index: number;
  onIndexChange: (index: number) => void;
} | null>(null);

/** Shares just the photo selection; the page's facts remain server children.
 *  Read the URL through its hydration-safe store and leave it unchanged when
 *  browsing, as the dialog does. Only a shared link names the chosen photo. */
export function AnimalPagePhotoProvider({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const [stepped, setStepped] = useState<number | null>(null);
  const index = clampPhotoIndex(stepped ?? photoFromSearch(search), count);
  return (
    <PhotoSelection.Provider value={{ index, onIndexChange: setStepped }}>
      {children}
    </PhotoSelection.Provider>
  );
}

export function useAnimalPagePhoto() {
  const selection = useContext(PhotoSelection);
  if (!selection) {
    throw new Error("Animal page photos need AnimalPagePhotoProvider");
  }
  return selection;
}

export function AnimalPageShareButton({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  const { index } = useAnimalPagePhoto();
  return <ShareButton path={path} name={name} photo={index} />;
}
