import { serializeSpeculationRules } from "@/lib/speculation-rules";

/**
 * Chromium's Speculation Rules API, in the head of both roots. The rules
 * themselves and the reasoning behind them live in lib/speculation-rules.ts.
 */
export function SpeculationRules() {
  return (
    <script
      type="speculationrules"
      dangerouslySetInnerHTML={{ __html: serializeSpeculationRules() }}
    />
  );
}
