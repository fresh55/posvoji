# Adding a provider

A provider is one folder in `providers/` that adapts a single shelter's public
listings to the shared `Animal` schema.

## Before you write code

Check [data/shelters.yaml](../data/shelters.yaml) for the shelter and open a
"Predlagaj zavetišče" issue so work isn't duplicated. You can build and merge a
parser before the shelter has answered — it just stays disabled until a granted
permission is recorded.

## Anatomy

```text
providers/<shelter-slug>/
  package.json        # @posvoji/provider-<slug>, deps on the SDK
  policy.yaml         # machine-readable permission record (CI-validated)
  provider.ts         # parse functions + the AdoptionProvider export
  provider.test.ts    # fixture tests
  fixtures/           # minimal HTML samples
```

Start by copying `providers/_template`.

## Rules

1. **The folder name, `providerId` in `policy.yaml` and `id` in `provider.ts`
   must match.** `pnpm validate:policies` checks this.
2. **All HTTP goes through the SDK's `PoliteClient`** (`ctx.client.get(...)`).
   It enforces robots.txt, per-host serialization, delays, backoff and
   conditional requests. Never import an HTTP client directly.
3. **Parse functions are pure and exported** (`parseList`, `parseDetail`), so
   tests run offline against fixtures. Prefer label-based lookups ("Spol",
   "Starost") over positional selectors — they survive redesigns.
4. **Fixtures are minimal.** Trim saved HTML to the markup your parser needs.
   No full page mirrors, no photos, no personal data of private individuals.
5. **Normalize conservatively.** Map only fields the schema knows. When a
   value is unclear, omit it or use `"unknown"` — never guess. The `Animal`
   schema rejects unknown fields on purpose.
6. **Respect the policy.** Without granted permission, `images` must be
   `none` and `descriptions` must be `facts-only`; the schema enforces this.
   Exclude private-listing paths via `crawl.excludePaths`.

## Wiring it up

Register the provider in `apps/ingest/src/registry.ts`. It will only actually
crawl once `policy.yaml` has `enabled: true`, which requires:

```yaml
permission:
  status: granted
  date: 2026-09-01
  reference: <where the written permission is archived>
```

## Checks

```bash
pnpm --filter @posvoji/provider-<slug> test
pnpm validate:policies
pnpm typecheck
```
