import { z } from "zod";

export const IngestionMode = z.enum(["scrape", "api", "rss", "manual"]);
export type IngestionMode = z.infer<typeof IngestionMode>;

export const ImagePolicy = z.enum(["none", "remote", "cache-permitted"]);
export type ImagePolicy = z.infer<typeof ImagePolicy>;

export const DescriptionPolicy = z.enum([
  "facts-only",
  "excerpt-permitted",
  "full-permitted",
]);
export type DescriptionPolicy = z.infer<typeof DescriptionPolicy>;

// A shelter's logo is its trademark, not one of its animal photographs, so it
// carries its own grant rather than riding along on `images`.
export const LogoUse = z.enum(["none", "permitted"]);
export type LogoUse = z.infer<typeof LogoUse>;

export const LogoPolicy = z.strictObject({
  use: LogoUse.default("none"),
  // The logo file itself. Left out, the fetcher looks for one on the
  // shelter's home page and pins what it found back here.
  url: z.url().optional(),
  // The logo grant is its own decision on its own date, so it records them
  // rather than borrowing the photo grant's.
  date: z.iso.date().optional(),
  reference: z.string().optional(),
});
export type LogoPolicy = z.infer<typeof LogoPolicy>;

export const PermissionStatus = z.enum([
  "none",
  "requested",
  "granted",
  "denied",
]);
export type PermissionStatus = z.infer<typeof PermissionStatus>;

const ProviderPolicyShape = z.strictObject({
  providerId: z
    .string()
    .regex(/^[a-z0-9-]+$/, "providerId must be a kebab-case slug"),
  source: z.url(),
  enabled: z.boolean(),

  ingestion: IngestionMode,
  images: ImagePolicy,
  descriptions: DescriptionPolicy,
  logo: LogoPolicy.prefault({ use: "none" }),

  permission: z.strictObject({
    status: PermissionStatus,
    date: z.iso.date().optional(),
    // Where the written permission is archived, e.g. a mail thread id. Never
    // the correspondence or anyone's contact details.
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),

  allowedFields: z.array(z.string()).optional(),
  attribution: z.string().min(1),

  crawl: z.strictObject({
    intervalHours: z.number().positive(),
    excludePaths: z.array(z.string()).default([]),
  }),
});

// Without granted permission a provider stays off, shows no images and carries
// nothing beyond bare facts.
export const ProviderPolicy = ProviderPolicyShape.superRefine((p, ctx) => {
  const granted = p.permission.status === "granted";

  if (p.enabled && !granted) {
    ctx.addIssue({
      code: "custom",
      path: ["enabled"],
      message: `provider "${p.providerId}" cannot be enabled: permission.status is "${p.permission.status}", not "granted"`,
    });
  }
  if (!granted && p.images !== "none") {
    ctx.addIssue({
      code: "custom",
      path: ["images"],
      message: `provider "${p.providerId}" has no granted permission: images must be "none"`,
    });
  }
  if (!granted && p.logo.use !== "none") {
    ctx.addIssue({
      code: "custom",
      path: ["logo", "use"],
      message: `provider "${p.providerId}" has no granted permission: logo.use must be "none"`,
    });
  }
  if (!granted && p.descriptions !== "facts-only") {
    ctx.addIssue({
      code: "custom",
      path: ["descriptions"],
      message: `provider "${p.providerId}" has no granted permission: descriptions must be "facts-only"`,
    });
  }
  if (p.logo.use !== "none" && p.logo.date === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["logo", "date"],
      message: `provider "${p.providerId}": a permitted logo must record the date it was granted`,
    });
  }
  if (granted && p.permission.date === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["permission", "date"],
      message: `provider "${p.providerId}": granted permission must record a date`,
    });
  }
});
export type ProviderPolicy = z.infer<typeof ProviderPolicy>;
