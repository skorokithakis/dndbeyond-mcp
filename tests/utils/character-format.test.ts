import { describe, it, expect } from "vitest";
import { formatAbilityBreakdown, formatAbilityScores } from "../../src/utils/character-format.js";
import { computeAbilityScoreBreakdown } from "../../src/utils/character-calculations.js";
import type { DdbCharacter } from "../../src/types/character.js";
import bearbug from "../fixtures/bearbug-character.json";

describe("formatAbilityScores", () => {
  it("shows item sources for the Bearbug fixture", () => {
    const text = formatAbilityScores(bearbug as unknown as DdbCharacter);
    const cloak =
      "Dazzling Cloak of Stealth and Beauty and Other Amazing Attributes That Are Excellent";

    expect(text).toContain(`CON: 16 (+3) [base 10, +6 ${cloak}]`);
    expect(text).toContain(
      "DEX: 19 (+4) [base 8, +1 race, set 19 (Gloves of Dexterity)]"
    );
    expect(text).toContain(`CHA: 20 (+5) [base 15, +2 class, +3 ${cloak}]`);
  });

  it("omits brackets when the score is base only", () => {
    const char = {
      stats: [],
      bonusStats: [],
      overrideStats: [],
      modifiers: {},
      inventory: [],
    } as unknown as DdbCharacter;

    expect(formatAbilityScores(char)).toBe(
      "STR: 10 (+0) | DEX: 10 (+0) | CON: 10 (+0) | INT: 10 (+0) | WIS: 10 (+0) | CHA: 10 (+0)"
    );
  });

  it("shows overrides and bonus stats", () => {
    const char = {
      stats: [{ id: 1, value: 12 }],
      bonusStats: [{ id: 1, value: 2 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
    } as unknown as DdbCharacter;

    expect(formatAbilityScores(char)).toContain("STR: 14 (+2) [base 12, +2 other]");

    const override = computeAbilityScoreBreakdown(
      [{ id: 1, value: 12 }],
      [],
      [{ id: 1, value: 20 }],
      {},
      1
    );
    expect(formatAbilityBreakdown(override)).toBe(" [override 20]");
  });
});
