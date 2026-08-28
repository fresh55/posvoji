import { type JsonLdNode, serializeJsonLd } from "@/lib/shelter-jsonld";

/** One <script type="application/ld+json"> for a node built in lib. Rendered on
 *  the server only, which is all a static export has; nothing here reads the
 *  document or the URL. */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return (
    // dangerouslySetInnerHTML because a script's contents must not be HTML
    // escaped: React would write &quot; for every quote and the JSON would not
    // parse. It is safe because the text is JSON.stringify output with <, > and
    // & escaped by serializeJsonLd, so no value can close the tag or open one.
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
