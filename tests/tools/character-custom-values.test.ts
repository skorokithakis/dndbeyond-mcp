import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCharacter,
  listCharacterCustomValues,
  setCharacterCustomValue,
} from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter, DdbCharacterValue } from "../../src/types/character.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    put: vi.fn().mockResolvedValue({}),
  } as unknown as DdbClient;
}

function customValue(
  typeId: number,
  value: number | string | null,
  valueId: string | null = null,
  notes: string | null = null
): DdbCharacterValue {
  return {
    typeId,
    value,
    notes,
    valueId,
    valueTypeId: null,
    contextId: null,
    contextTypeId: null,
  };
}

const baseCharacter = {
  id: 123,
  readonlyUrl: "https://www.dndbeyond.com/characters/123",
  name: "Test Character",
  race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false, racialTraits: [] },
  classes: [
    {
      id: 1,
      definition: { name: "Fighter" },
      subclassDefinition: null,
      level: 5,
      isStartingClass: true,
      classFeatures: [],
    },
  ],
  background: { definition: null },
  stats: [
    { id: 1, value: 10 },
    { id: 2, value: 14 }, // DEX +2
    { id: 3, value: 12 },
    { id: 4, value: 10 },
    { id: 5, value: 10 },
    { id: 6, value: 10 },
  ],
  bonusStats: [],
  overrideStats: [],
  baseHitPoints: 40,
  bonusHitPoints: null,
  overrideHitPoints: null,
  removedHitPoints: 0,
  temporaryHitPoints: 0,
  currentXp: 0,
  alignmentId: 1,
  lifestyleId: 1,
  currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  spells: { race: [], class: [], background: [], item: [], feat: [] },
  inventory: [],
  deathSaves: { failCount: null, successCount: null, isStabilized: false },
  traits: {
    personalityTraits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    appearance: null,
  },
  preferences: {},
  configuration: {},
  actions: {},
  modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
  feats: [],
  notes: {
    personalPossessions: null,
    backstory: null,
    otherNotes: null,
    allies: null,
    organizations: null,
  },
  campaign: null,
  characterValues: [] as DdbCharacterValue[],
} as unknown as DdbCharacter;

describe("setCharacterCustomValue", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(baseCharacter);
  });

  it("sets an AC misc bonus and invalidates the character cache", async () => {
    const result = await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "ac_misc_bonus",
      value: 1,
      notes: "Cloak",
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/custom/value",
      {
        characterId: 123,
        typeId: 3,
        value: 1,
        notes: "Cloak",
        valueId: null,
        valueTypeId: null,
        contextId: null,
        contextTypeId: null,
        partyId: null,
      },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Set AC misc bonus to 1 on character 123");
  });

  it("sets a saving throw value for the chosen ability", async () => {
    const result = await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "saving_throw_misc_bonus",
      value: 2,
      ability: "CON",
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/custom/value"),
      expect.objectContaining({
        typeId: 39,
        valueId: "3",
        valueTypeId: "1472902489",
      }),
      ["character:123"]
    );
    expect(result.content[0].text).toContain(
      "Set saving throw misc bonus (Constitution) to 2"
    );
  });

  it("resolves a skill name to its D&D Beyond skill ID", async () => {
    const result = await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "skill_magic_bonus",
      value: 1,
      skill: "Sleight of Hand",
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/custom/value"),
      expect.objectContaining({
        typeId: 25,
        valueId: "4",
        valueTypeId: "1958004211",
      }),
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Sleight of Hand");
  });

  it("removes a value with both value and notes null", async () => {
    await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "ac_misc_bonus",
      value: null,
      notes: "ignored on removal",
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ typeId: 3, value: null, notes: null }),
      ["character:123"]
    );
  });

  it("keeps an existing note when notes are omitted", async () => {
    vi.mocked(mockClient.get).mockResolvedValue({
      ...baseCharacter,
      characterValues: [customValue(3, 1, null, "Cloak")],
    });

    await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "ac_misc_bonus",
      value: 2,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ typeId: 3, value: 2, notes: "Cloak" }),
      ["character:123"]
    );
  });

  it("rejects a saving throw value without an ability", async () => {
    const result = await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "saving_throw_override",
      value: 10,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("requires ability");
  });

  it("rejects an unknown skill", async () => {
    const result = await setCharacterCustomValue(mockClient, {
      characterId: 123,
      valueType: "skill_override",
      value: 10,
      skill: "Basket Weaving",
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("requires skill");
  });
});

describe("listCharacterCustomValues", () => {
  it("lists AC, save, skill and unknown values plus ability adjustments", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue({
      ...baseCharacter,
      bonusStats: [
        { id: 1, value: 2 },
        { id: 2, value: null },
      ],
      overrideStats: [{ id: 6, value: 18 }],
      characterValues: [
        customValue(3, 1),
        customValue(39, 2, "3"),
        customValue(25, 1, "5"),
        customValue(10, 3, "327816723"),
      ],
    });

    const result = await listCharacterCustomValues(client, { characterId: 123 });
    const text = result.content[0].text;

    expect(text).toContain("Custom values for Test Character:");
    expect(text).toContain("AC misc bonus: 1 [applied to AC]");
    expect(text).toContain("saving throw misc bonus (Constitution): 2");
    expect(text).toContain("skill magic bonus (Stealth): 1");
    expect(text).toContain("fixed value bonus: 3");
    expect(text).toContain("STR bonus: +2");
    expect(text).toContain("CHA override: 18");
  });

  it("says when a character has no custom values", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(baseCharacter);

    const result = await listCharacterCustomValues(client, { characterId: 123 });
    expect(result.content[0].text).toContain("(none)");
  });
});

describe("getCharacter with custom values", () => {
  it("applies AC custom values and shows other custom values as not applied", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue({
      ...baseCharacter,
      characterValues: [
        customValue(3, 1, null, "Cloak"),
        customValue(39, 2, "3"),
      ],
    });

    const result = await getCharacter(client, { characterId: 123, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 13"); // 10 + 2 DEX + 1 misc
    expect(text).toContain("--- Custom Values (not applied) ---");
    expect(text).toContain("saving throw misc bonus (Constitution): 2");
    expect(text).not.toContain("AC misc bonus");
  });
});
