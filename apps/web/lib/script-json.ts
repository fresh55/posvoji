/**
 * A value as the text of a <script> element that carries JSON.
 *
 * JSON.stringify alone is not enough inside an HTML element: a "</script>" in
 * any string value would close the tag and everything after it would parse as
 * markup. Escaping the three characters that can start a tag or an entity
 * leaves valid JSON, because < and friends are ordinary JSON escapes that
 * any parser reads back as the original characters.
 *
 * Two kinds of script are written this way, the shelter's ld+json
 * (lib/shelter-jsonld.ts) and the speculation rules (lib/speculation-rules.ts),
 * and they escape here rather than each on its own. Both had the same job and
 * the second copy escaped only the angle bracket, so the next character worth
 * escaping would have had to be remembered in two places.
 */
export function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
