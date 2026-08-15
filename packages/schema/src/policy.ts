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

  permission: z.strictObject({
    status: PermissionStatus,
    date: z.iso.date().optional(),
    // Reference to where the written permission is archived (e.g. a private
    // mail thread id) — never the correspondence or contact details itself.
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

// The legal posture of the whole project, enforced at parse time: without a
// shelter's recorded permission a provider cannot be enabled, cannot show
// images and cannot carry more than bare facts.
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
  if (!granted && p.descriptions !== "facts-only") {
    ctx.addIssue({
      code: "custom",
      path: ["descriptions"],
      message: `provider "${p.providerId}" has no granted permission: descriptions must be "facts-only"`,
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
