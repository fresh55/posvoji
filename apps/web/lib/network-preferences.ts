type Connection = EventTarget & {
  saveData?: boolean;
  effectiveType?: string;
};

function connection(): Connection | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: Connection }).connection;
}

/** Optional background downloads should respect the browser's data-saving setting. */
export function saveDataEnabled(): boolean {
  return connection()?.saveData === true;
}

/** Heavy decorative content can wait for a press on a constrained connection. */
export function limitedConnectionEnabled(): boolean {
  const network = connection();
  return network?.saveData === true ||
    network?.effectiveType === "slow-2g" || network?.effectiveType === "2g";
}

export function subscribeToConnection(listener: () => void): () => void {
  const network = connection();
  network?.addEventListener?.("change", listener);
  return () => network?.removeEventListener?.("change", listener);
}

/** The exported HTML cannot know the visitor's connection. */
export function getServerConnectionSnapshot(): false {
  return false;
}
