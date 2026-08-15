import { describe, expect, it } from "vitest";
import { waitingLabel } from "./labels";

describe("waitingLabel", () => {
  it("gets the dual right for months", () => {
    expect(waitingLabel(1)).toBe("čaka 1 mesec");
    expect(waitingLabel(2)).toBe("čaka 2 meseca");
    expect(waitingLabel(3)).toBe("čaka 3 mesece");
    expect(waitingLabel(4)).toBe("čaka 4 mesece");
    expect(waitingLabel(5)).toBe("čaka 5 mesecev");
    expect(waitingLabel(11)).toBe("čaka 11 mesecev");
  });

  it("switches to years at twelve months", () => {
    expect(waitingLabel(12)).toBe("čaka 1 leto");
    expect(waitingLabel(24)).toBe("čaka 2 leti");
    expect(waitingLabel(36)).toBe("čaka 3 leta");
    expect(waitingLabel(60)).toBe("čaka 5 let");
  });

  it("says less than a month rather than zero", () => {
    expect(waitingLabel(0)).toBe("čaka manj kot mesec");
  });
});
