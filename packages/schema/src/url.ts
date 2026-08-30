import { z } from "zod";

/**
 * A URL that can be fetched from or opened as an ordinary web resource.
 *
 * `z.url()` accepts every scheme understood by the URL constructor, including
 * `javascript:`, `data:` and `ftp:`. Schema URL fields cross into HTTP clients
 * and browser href/src attributes, so accepting those schemes would make the
 * validation boundary weaker than its consumers assume.
 */
export const HttpUrl = z
  .url({
    protocol: /^https?$/,
    error: "URL must use http or https",
  })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.username === "" && url.password === "";
      } catch {
        // z.url() reports the malformed URL; this refinement only adds the
        // credential rule once URL parsing is possible.
        return true;
      }
    },
    { message: "URL must not contain embedded credentials" },
  );
export type HttpUrl = z.infer<typeof HttpUrl>;
