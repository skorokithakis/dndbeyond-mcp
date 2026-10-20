import { describe, it, expect } from "vitest";
import {
  computeAbilityScoreBreakdown,
  computeFinalAbilityScore,
  sumModifierBonuses,
  calculateAc,
  computeLevel,
  calculateMaxHp,
  calculateCurrentHp,
} from "../../src/utils/character-calculations.js";
import type { DdbCharacter, DdbCharacterValue, DdbInventoryItem, DdbModifier } from "../../src/types/character.js";
import bearbug from "../fixtures/bearbug-character.json";

describe("computeFinalAbilityScore", () => {
  const baseStats = [
    { id: 1, value: 15 },
    { id: 2, value: 14 },
    { id: 3, value: 13 },
    { id: 4, value: 12 },
    { id: 5, value: 10 },
    { id: 6, value: 8 },
  ];

  it("should compute base + bonus when no override", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats: any[] = [];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(17); // 15 + 2
  });

  it("should return override value when present", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats = [{ id: 1, value: 20 }];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(20);
  });

  it("should add modifier bonuses to base + bonus", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats: any[] = [];
    const modifiers = {
      race: [],
      class: [],
      background: [],
      item: [
        { type: "bonus", subType: "strength-score", value: 1 } as DdbModifier,
      ],
      feat: [],
      condition: [],
    };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(18); // 15 + 2 + 1
  });

  it("should handle missing bonus stat", () => {
    const bonusStats: any[] = [];
    const overrideStats: any[] = [];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(15); // Just base
  });
});

describe("sumModifierBonuses", () => {
  it("should accumulate bonuses for matching subType", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
      ],
      class: [
        { type: "bonus", subType: "armor-class", value: 2 } as DdbModifier,
      ],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(3);
  });

  it("should ignore non-bonus types", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        { type: "set", subType: "armor-class", value: 13 } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(1); // Only the bonus type
  });

  it("should ignore null values", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        { type: "bonus", subType: "armor-class", value: null } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(1);
  });

  it("should return 0 when no matching modifiers", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "strength-score", value: 2 } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(0);
  });

  it("should count stacking bonuses", () => {
    const modifiers = {
      item: [
        { type: "stacking-bonus", subType: "charisma-score", value: 3 } as DdbModifier,
        { type: "bonus", subType: "charisma-score", value: 1 } as DdbModifier,
      ],
    };

    expect(sumModifierBonuses(modifiers, "charisma-score")).toBe(4);
  });

  it("should fall back to fixedValue when value is null", () => {
    const modifiers = {
      item: [
        { type: "bonus", subType: "hit-points", value: null, fixedValue: 4 } as DdbModifier,
      ],
    };

    expect(sumModifierBonuses(modifiers, "hit-points")).toBe(4);
  });
});

describe("computeFinalAbilityScore with sets and item state", () => {
  const baseStats = [{ id: 2, value: 8 }];

  it("should use the highest set value as a floor", () => {
    const modifiers = {
      item: [
        { type: "set", subType: "dexterity-score", value: 19 } as DdbModifier,
        { type: "set", subType: "dexterity-score", value: 17 } as DdbModifier,
      ],
    };

    const result = computeFinalAbilityScore(baseStats, [], [], modifiers, 2);
    expect(result).toBe(19);
  });

  it("should keep a computed score higher than the set value", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "dexterity-score", value: 12 } as DdbModifier,
      ],
      item: [
        { type: "set", subType: "dexterity-score", value: 19 } as DdbModifier,
      ],
    };

    const result = computeFinalAbilityScore(baseStats, [], [], modifiers, 2);
    expect(result).toBe(20); // base 8 + bonus 12 = 20, above the set floor
  });

  it("should ignore set modifiers from unequipped or unattuned items", () => {
    const modifiers = {
      item: [
        {
          type: "set",
          subType: "dexterity-score",
          value: 19,
          componentId: 1,
        } as DdbModifier,
        {
          type: "set",
          subType: "dexterity-score",
          value: 20,
          componentId: 2,
          requiresAttunement: true,
        } as DdbModifier,
      ],
    };
    const inventory = [
      { definition: { id: 1 }, equipped: false, isAttuned: false },
      { definition: { id: 2 }, equipped: true, isAttuned: false },
    ] as unknown as DdbCharacter["inventory"];

    const result = computeFinalAbilityScore(
      baseStats,
      [],
      [],
      modifiers,
      2,
      inventory
    );
    expect(result).toBe(8);
  });
});

describe("calculateAc", () => {
  const baseChar: DdbCharacter = {
    id: 1,
    name: "Test",
    readonlyUrl: "",
    race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
    classes: [
      {
        id: 1,
        definition: { name: "Fighter" },
        level: 5,
        isStartingClass: true,
        subclassDefinition: null,
        classFeatures: [],
      },
    ],
    level: 5,
    stats: [
      { id: 1, value: 10 }, // STR
      { id: 2, value: 14 }, // DEX (+2)
      { id: 3, value: 12 }, // CON (+1)
      { id: 4, value: 10 }, // INT
      { id: 5, value: 10 }, // WIS
      { id: 6, value: 10 }, // CHA
    ],
    bonusStats: [],
    overrideStats: [],
    modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
    inventory: [],
    baseHitPoints: 42,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    background: null,
    currentXp: 0,
    alignmentId: null,
    lifestyleId: null,
    spells: { race: [], class: [], background: [], item: [], feat: [] },
    deathSaves: { failCount: null, successCount: null, isStabilized: false },
    traits: {
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      appearance: "",
    },
    preferences: {},
    configuration: {},
    campaign: null,
  } as unknown as DdbCharacter;

  it("should calculate unarmored AC (10 + DEX)", () => {
    const result = calculateAc(baseChar);
    expect(result).toBe(12); // 10 + 2
  });

  it("should calculate light armor AC (AC + DEX)", () => {
    const charWithLightArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Leather Armor",
            type: "",
            filterType: "Armor",
            armorTypeId: 1,
            armorClass: 11,
            rarity: "Common",
            weight: 10,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithLightArmor);
    expect(result).toBe(13); // 11 + 2
  });

  it("should calculate medium armor AC (AC + min(DEX, 2))", () => {
    const charWithMediumArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Scale Mail",
            type: "",
            filterType: "Armor",
            armorTypeId: 2,
            armorClass: 14,
            rarity: "Common",
            weight: 45,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithMediumArmor);
    expect(result).toBe(16); // 14 + 2
  });

  it("should calculate heavy armor AC (AC only, no DEX)", () => {
    const charWithHeavyArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Chain Mail",
            type: "",
            filterType: "Armor",
            armorTypeId: 3,
            armorClass: 16,
            rarity: "Common",
            weight: 55,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithHeavyArmor);
    expect(result).toBe(16); // Just armor AC
  });

  it("should add shield bonus to AC", () => {
    const charWithShield = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Shield",
            type: "",
            filterType: "Armor",
            armorTypeId: 4,
            armorClass: 2,
            rarity: "Common",
            weight: 6,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithShield);
    expect(result).toBe(14); // 10 + 2 (DEX) + 2 (shield)
  });

  it("should calculate Barbarian unarmored defense (10 + DEX + CON)", () => {
    const barbarian = {
      ...baseChar,
      classes: [
        {
          id: 1,
          definition: { name: "Barbarian" },
          level: 5,
          isStartingClass: true,
          subclassDefinition: null,
          classFeatures: [],
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(barbarian);
    expect(result).toBe(13); // 10 + 2 (DEX) + 1 (CON)
  });

  it("should calculate Monk unarmored defense (10 + DEX + WIS)", () => {
    const monk = {
      ...baseChar,
      stats: [
        { id: 1, value: 10 }, // STR
        { id: 2, value: 14 }, // DEX (+2)
        { id: 3, value: 10 }, // CON
        { id: 4, value: 10 }, // INT
        { id: 5, value: 16 }, // WIS (+3)
        { id: 6, value: 10 }, // CHA
      ],
      classes: [
        {
          id: 1,
          definition: { name: "Monk" },
          level: 5,
          isStartingClass: true,
          subclassDefinition: null,
          classFeatures: [],
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(monk);
    expect(result).toBe(15); // 10 + 2 (DEX) + 3 (WIS)
  });

  it("should add AC modifiers from features", () => {
    const charWithAcBonus = {
      ...baseChar,
      modifiers: {
        race: [],
        class: [
          { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        ],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithAcBonus);
    expect(result).toBe(13); // 10 + 2 (DEX) + 1 (feature)
  });

  it("should use the equipped body armor with the highest AC", () => {
    const charWithTwoArmors = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Leather",
            type: "",
            filterType: "Armor",
            armorTypeId: 1,
            armorClass: 11,
          },
          equipped: true,
        },
        {
          id: 2,
          definition: {
            name: "Studded Leather",
            type: "",
            filterType: "Armor",
            armorTypeId: 1,
            armorClass: 12,
          },
          equipped: true,
        },
      ],
    } as unknown as DdbCharacter;

    expect(calculateAc(charWithTwoArmors)).toBe(14); // 12 + 2 (DEX)
  });

  it("should add magic armor bonus once via its armor-class modifier", () => {
    const charWithMagicArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            id: 1,
            name: "Studded Leather, +1",
            type: "",
            filterType: "Armor",
            armorTypeId: 1,
            armorClass: 12, // base AC, magic bonus is a modifier
          },
          equipped: true,
        },
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [
          {
            type: "bonus",
            subType: "armor-class",
            value: 1,
            componentId: 1,
          } as DdbModifier,
        ],
        feat: [],
        condition: [],
      },
    } as unknown as DdbCharacter;

    expect(calculateAc(charWithMagicArmor)).toBe(15); // 12 + 2 (DEX) + 1 (magic)
  });

  it("should rank body armors by full AC including their magic bonuses", () => {
    const charWithTwoMagicArmors = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            id: 1,
            name: "Plate, +1",
            type: "",
            filterType: "Armor",
            armorTypeId: 3,
            armorClass: 18,
          },
          equipped: true,
        },
        {
          id: 2,
          definition: {
            id: 2,
            name: "Chain Mail, +2",
            type: "",
            filterType: "Armor",
            armorTypeId: 3,
            armorClass: 16,
          },
          equipped: true,
        },
      ],
      modifiers: {
        ...baseChar.modifiers,
        item: [
          {
            type: "bonus",
            subType: "armor-class",
            value: 1,
            componentId: 1,
          } as DdbModifier,
          {
            type: "bonus",
            subType: "armor-class",
            value: 2,
            componentId: 2,
          } as DdbModifier,
        ],
      },
    } as unknown as DdbCharacter;

    // Plate +1 wins (18 + 1); the chain mail's +2 is not added on top.
    expect(calculateAc(charWithTwoMagicArmors)).toBe(19);
  });

  it("should not subtract non-item AC modifiers that share an armor's id", () => {
    const charWithSharedIdBonus = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            id: 1,
            name: "Plate",
            type: "",
            filterType: "Armor",
            armorTypeId: 3,
            armorClass: 18,
          },
          equipped: true,
        },
        {
          id: 2,
          definition: {
            id: 2,
            name: "Chain Mail",
            type: "",
            filterType: "Armor",
            armorTypeId: 3,
            armorClass: 16,
          },
          equipped: true,
        },
      ],
      modifiers: {
        ...baseChar.modifiers,
        class: [
          {
            type: "bonus",
            subType: "armor-class",
            value: 2,
            componentId: 2, // same id as the unselected chain mail
          } as DdbModifier,
        ],
      },
    } as unknown as DdbCharacter;

    // Plate (18) + the class bonus (2); the class bonus must not be cancelled
    // out by matching the chain mail's definition id.
    expect(calculateAc(charWithSharedIdBonus)).toBe(20);
  });

  it("should use only the best shield including its magic bonus", () => {
    const charWithTwoMagicShields = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            id: 1,
            name: "Shield, +1",
            type: "",
            filterType: "Armor",
            armorTypeId: 4,
            armorClass: 2,
          },
          equipped: true,
        },
        {
          id: 2,
          definition: {
            id: 2,
            name: "Shield, +2",
            type: "",
            filterType: "Armor",
            armorTypeId: 4,
            armorClass: 2,
          },
          equipped: true,
        },
      ],
      modifiers: {
        ...baseChar.modifiers,
        item: [
          {
            type: "bonus",
            subType: "armor-class",
            value: 1,
            componentId: 1,
          } as DdbModifier,
          {
            type: "bonus",
            subType: "armor-class",
            value: 2,
            componentId: 2,
          } as DdbModifier,
        ],
      },
    } as unknown as DdbCharacter;

    // 10 + 2 (DEX) + the +2 shield (2 + 2); the +1 shield is not added.
    expect(calculateAc(charWithTwoMagicShields)).toBe(16);
  });

  it("should ignore armor-class modifiers from unequipped items", () => {
    const charWithUnequippedBonus = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: { id: 1, name: "Test Cloak" },
          equipped: false,
        },
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [
          {
            type: "bonus",
            subType: "armor-class",
            value: 2,
            componentId: 1,
          } as DdbModifier,
        ],
        feat: [],
        condition: [],
      },
    } as unknown as DdbCharacter;

    expect(calculateAc(charWithUnequippedBonus)).toBe(12); // 10 + 2 (DEX)
  });
});

describe("Bearbug fixture", () => {
  const char = bearbug as unknown as DdbCharacter;

  it("should match D&D Beyond ability scores", () => {
    const scores = [1, 2, 3, 4, 5, 6].map((id) =>
      computeFinalAbilityScore(
        char.stats,
        char.bonusStats,
        char.overrideStats,
        char.modifiers,
        id,
        char.inventory
      )
    );
    expect(scores).toEqual([16, 19, 16, 16, 9, 20]);
  });

  it("should attribute ability bonuses to their sources", () => {
    const cloak =
      "Dazzling Cloak of Stealth and Beauty and Other Amazing Attributes That Are Excellent";

    const con = computeAbilityScoreBreakdown(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      3,
      char.inventory
    );
    expect(con.total).toBe(16);
    expect(con.contributions).toEqual([{ source: cloak, value: 6 }]);
    expect(con.set).toBeNull();

    const dex = computeAbilityScoreBreakdown(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      2,
      char.inventory
    );
    expect(dex.total).toBe(19);
    expect(dex.contributions).toEqual([{ source: "race", value: 1 }]);
    expect(dex.set).toEqual({ value: 19, source: "Gloves of Dexterity" });

    const cha = computeAbilityScoreBreakdown(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      6,
      char.inventory
    );
    expect(cha.total).toBe(20);
    expect(cha.contributions).toEqual([
      { source: "class", value: 2 },
      { source: cloak, value: 3 },
    ]);
  });

  it("should omit a set modifier that does not set the total", () => {
    const baseStats = [{ id: 2, value: 8 }];
    const modifiers = {
      race: [
        { type: "bonus", subType: "dexterity-score", value: 12 } as DdbModifier,
      ],
      item: [
        { type: "set", subType: "dexterity-score", value: 19 } as DdbModifier,
      ],
    };

    const breakdown = computeAbilityScoreBreakdown(
      baseStats,
      [],
      [],
      modifiers,
      2
    );
    expect(breakdown.total).toBe(20);
    expect(breakdown.set).toBeNull();
  });

  it("should describe overrides and bonus stats", () => {
    const overrideBreakdown = computeAbilityScoreBreakdown(
      [{ id: 1, value: 12 }],
      [],
      [{ id: 1, value: 20 }],
      {},
      1
    );
    expect(overrideBreakdown.total).toBe(20);
    expect(overrideBreakdown.override).toBe(20);

    const bonusBreakdown = computeAbilityScoreBreakdown(
      [{ id: 1, value: 12 }],
      [{ id: 1, value: 2 }],
      [],
      {},
      1
    );
    expect(bonusBreakdown.total).toBe(14);
    expect(bonusBreakdown.bonus).toBe(2);
  });

  it("should match D&D Beyond AC and hit points", () => {
    expect(calculateAc(char)).toBe(19);
    expect(calculateMaxHp(char)).toBe(99);
    expect(calculateCurrentHp(char)).toBe(55);
  });
});

describe("calculateAc with characterValues customizations", () => {
  const baseChar: DdbCharacter = {
    id: 1,
    name: "Test",
    readonlyUrl: "",
    race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
    classes: [
      {
        id: 1,
        definition: { name: "Fighter" },
        level: 5,
        isStartingClass: true,
        subclassDefinition: null,
        classFeatures: [],
      },
    ],
    level: 5,
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
    modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
    inventory: [],
    baseHitPoints: 42,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    background: null,
    currentXp: 0,
    alignmentId: null,
    lifestyleId: null,
    spells: { race: [], class: [], background: [], item: [], feat: [] },
    deathSaves: { failCount: null, successCount: null, isStabilized: false },
    traits: {
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      appearance: "",
    },
    preferences: {},
    configuration: {},
    campaign: null,
    characterValues: [],
  } as unknown as DdbCharacter;

  function customValue(
    typeId: number,
    value: number | string | null,
    valueId: string | null = null
  ): DdbCharacterValue {
    return {
      typeId,
      value,
      notes: null,
      valueId,
      valueTypeId: null,
      contextId: null,
      contextTypeId: null,
    };
  }

  it("should add magic and misc AC bonuses", () => {
    const char = {
      ...baseChar,
      characterValues: [customValue(2, 1), customValue(3, 2)],
    };
    expect(calculateAc(char)).toBe(15); // 10 + 2 DEX + 1 + 2
  });

  it("should apply an override AC and ignore other sources", () => {
    const char = {
      ...baseChar,
      characterValues: [
        customValue(1, 25),
        customValue(2, 1),
        customValue(3, 1),
        customValue(4, 10),
      ],
    };
    expect(calculateAc(char)).toBe(25);
  });

  it("should replace base armor + DEX but keep shields and bonuses", () => {
    const shield: DdbInventoryItem = {
      id: 1,
      definition: {
        name: "Shield",
        description: "",
        type: "",
        rarity: "Common",
        weight: 6,
        cost: 10,
        isHomebrew: false,
        armorClass: 2,
        armorTypeId: 4,
        filterType: "Armor",
      },
      equipped: true,
      quantity: 1,
    };
    const char = {
      ...baseChar,
      inventory: [shield],
      characterValues: [customValue(4, 15), customValue(3, 1)],
    };
    expect(calculateAc(char)).toBe(18); // 15 base override + 2 shield + 1 misc
  });

  it("should keep the unarmored defense ability modifier with a base armor override", () => {
    const char = {
      ...baseChar,
      classes: [
        {
          id: 1,
          definition: { name: "Barbarian" },
          level: 5,
          isStartingClass: true,
          subclassDefinition: null,
          classFeatures: [],
        },
      ],
      characterValues: [customValue(4, 15)],
    };
    // D&D Beyond replaces 10 + DEX (12) with 15 but still adds CON +1.
    expect(calculateAc(char)).toBe(16);
  });

  it("should ignore non-AC custom values in AC", () => {
    const char = {
      ...baseChar,
      characterValues: [
        customValue(38, 5, "2"),
        customValue(39, 5, "2"),
        customValue(23, 5, "5"),
        customValue(9, "note"),
      ],
    };
    expect(calculateAc(char)).toBe(12);
  });
});

describe("computeLevel", () => {
  it("should sum class levels", () => {
    const char = {
      classes: [
        { level: 5 },
        { level: 3 },
      ],
    } as unknown as DdbCharacter;

    const result = computeLevel(char);
    expect(result).toBe(8);
  });

  it("should handle single class", () => {
    const char = {
      classes: [
        { level: 10 },
      ],
    } as unknown as DdbCharacter;

    const result = computeLevel(char);
    expect(result).toBe(10);
  });
});

describe("calculateMaxHp", () => {
  const hpChar = {
    classes: [{ level: 5 }, { level: 3 }],
    stats: [
      { id: 1, value: 10 },
      { id: 2, value: 10 },
      { id: 3, value: 14 }, // CON +2
      { id: 4, value: 10 },
      { id: 5, value: 10 },
      { id: 6, value: 10 },
    ],
    bonusStats: [],
    overrideStats: [],
    modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
    inventory: [],
  };

  it("should return base + bonus when no override", () => {
    const char = {
      ...hpChar,
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: null,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(63); // 42 + 5 + 2 (CON) * 8 (level)
  });

  it("should return override when present", () => {
    const char = {
      ...hpChar,
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: 100,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(100);
  });

  it("should handle null bonus", () => {
    const char = {
      ...hpChar,
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(58); // 42 + 2 (CON) * 8 (level)
  });

  it("should add hit-points-per-level modifiers per level", () => {
    const char = {
      ...hpChar,
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
      modifiers: {
        ...hpChar.modifiers,
        feat: [
          {
            type: "bonus",
            subType: "hit-points-per-level",
            value: 2,
            componentId: 1,
          } as DdbModifier,
        ],
      },
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(74); // 42 + 16 (CON) + 16 (Tough)
  });

  it("should ignore hit-points-per-level modifiers from unequipped items", () => {
    const char = {
      ...hpChar,
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
      inventory: [
        {
          equipped: false,
          definition: { id: 99, name: "Test Charm" },
        },
      ],
      modifiers: {
        ...hpChar.modifiers,
        item: [
          {
            type: "stacking-bonus",
            subType: "hit-points-per-level",
            value: 2,
            componentId: 99,
          } as DdbModifier,
        ],
      },
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(58); // Item not equipped
  });
});

describe("calculateCurrentHp", () => {
  it("should return max - removed", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: null,
      removedHitPoints: 10,
      classes: [],
      stats: [],
      bonusStats: [],
      overrideStats: [],
      modifiers: {},
      inventory: [],
    } as unknown as DdbCharacter;

    const result = calculateCurrentHp(char);
    expect(result).toBe(37); // 47 - 10
  });

  it("should handle zero damage", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
      removedHitPoints: 0,
      classes: [],
      stats: [],
      bonusStats: [],
      overrideStats: [],
      modifiers: {},
      inventory: [],
    } as unknown as DdbCharacter;

    const result = calculateCurrentHp(char);
    expect(result).toBe(42);
  });
});
