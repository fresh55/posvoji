import { z } from "zod";
import { HttpUrl } from "./url";

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
  url: HttpUrl.optional(),
  // A mark the shelter handed us rather than published, as a path from the
  // repository root. Some shelters have no site to fetch from, or publish
  // only a banner with a phone number burnt into it, and send the artwork
  // instead; there is no URL to pin for those, so the file travels with the
  // repository and the sync reads it from disk.
  file: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9._/-]*$/i, "logo.file must be a relative path")
    .refine((path) => !path.split("/").includes(".."), {
      message: "logo.file must not climb out of the repository",
    })
    .optional(),
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

// These prefixes are a permission boundary: private-owner sections are kept
// out of the crawl with them. Accept one unambiguous, already-decoded pathname
// representation so a typo cannot validate but fail to match at runtime.
export const CrawlExcludePath = z.string().min(1).superRefine((path, ctx) => {
  let problem: string | undefined;

  if (!path.startsWith("/") || path.startsWith("//")) {
    problem = "must be an absolute path starting with one slash";
  } else if (path.trim() !== path || /[\\?#\u0000-\u001f\u007f]/.test(path)) {
    problem =
      "must not contain surrounding whitespace, a query, fragment, or backslash";
  } else {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      problem = "must contain valid percent encoding";
      decoded = path;
    }
    if (problem === undefined && decoded !== path) {
      problem = "must be written in decoded canonical form";
    }
    if (
      problem === undefined &&
      (path.includes("//") ||
        path.split("/").some((segment) => segment === "." || segment === ".."))
    ) {
      problem = "must not contain repeated slashes or traversal segments";
    }
  }

  if (problem !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: `crawl.excludePaths entry ${problem}`,
    });
  }
});

const ProviderPolicyShape = z.strictObject({
  providerId: z
    .string()
    .regex(/^[a-z0-9-]+$/, "providerId must be a kebab-case slug"),
  source: HttpUrl,
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
    excludePaths: z.array(CrawlExcludePath).default([]),
  }),
});

// Without granted catalogue permission a provider stays off, shows no animal
// images and carries nothing beyond bare facts. A shelter logo has its own
// dated grant in LogoPolicy and must not turn a logo-only approval into
// permission to ingest the shelter's catalogue.
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
  if (p.logo.url !== undefined && p.logo.file !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["logo", "file"],
      message: `provider "${p.providerId}": a logo is fetched from url or read from file, not both`,
    });
  }
  if (p.logo.use === "none" && p.logo.file !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["logo", "file"],
      message: `provider "${p.providerId}": logo.file is set but logo.use is "none"`,
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
