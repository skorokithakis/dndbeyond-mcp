/**
 * Shared character calculation utilities used by both tools and resources.
 * These are the canonical implementations for ability scores, AC, HP, and level.
 */

import type {
  DdbCharacter,
  DdbAbilityScore,
  DdbInventoryItem,
  DdbModifier,
} from "../types/character.js";

export const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

// Maps stat ID (1-6) to the subType prefix used in D&D Beyond modifiers
export const ABILITY_SUBTYPE_MAP: Record<number, string> = {
  1: "strength-score",
  2: "dexterity-score",
  3: "constitution-score",
  4: "intelligence-score",
  5: "wisdom-score",
  6: "charisma-score",
};

export function calculateAbilityModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Item modifiers are listed on the character even when the item is not
 * equipped or attuned, so only count modifiers granted by active items.
 */
function isActiveItemModifier(
  mod: DdbModifier,
  inventory: DdbInventoryItem[]
): boolean {
  const item = inventory.find((i) => i.definition.id === mod.componentId);
  if (!item?.equipped) return false;
  if (mod.requiresAttunement && !item.isAttuned) return false;
  return true;
}

function modifierValue(mod: DdbModifier): number | null {
  return mod.value ?? mod.fixedValue ?? null;
}

interface ModifierBonus {
  group: string;
  mod: DdbModifier;
  value: number;
}

function collectModifierBonuses(
  modifiers: Record<string, DdbModifier[]>,
  subType: string,
  inventory?: DdbInventoryItem[],
  componentId?: number
): ModifierBonus[] {
  const bonuses: ModifierBonus[] = [];
  for (const [group, list] of Object.entries(modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.subType !== subType) continue;
      if (mod.type !== "bonus" && mod.type !== "stacking-bonus") continue;
      if (componentId !== undefined && mod.componentId !== componentId) continue;
      if (group === "item" && inventory && !isActiveItemModifier(mod, inventory)) {
        continue;
      }

      const value = modifierValue(mod);
      if (value != null) bonuses.push({ group, mod, value });
    }
  }
  return bonuses;
}

/** Armor-class bonus granted by a single equipped item, e.g. a +1 armor. */
function itemArmorClassBonus(
  modifiers: Record<string, DdbModifier[]>,
  item: DdbInventoryItem,
  inventory: DdbInventoryItem[]
): number {
  // componentId is only unique within the item bucket; features can share IDs.
  return collectModifierBonuses(
    { item: modifiers.item ?? [] },
    "armor-class",
    inventory,
    item.definition.id
  ).reduce((total, bonus) => total + bonus.value, 0);
}

export function sumModifierBonuses(
  modifiers: Record<string, DdbModifier[]>,
  subType: string,
  inventory?: DdbInventoryItem[]
): number {
  return collectModifierBonuses(modifiers, subType, inventory).reduce(
    (total, bonus) => total + bonus.value,
    0
  );
}

/** Human-readable source for a modifier, using the item name where possible. */
function modifierSource(
  group: string,
  mod: DdbModifier,
  inventory?: DdbInventoryItem[]
): string {
  if (group === "item") {
    const item = inventory?.find((i) => i.definition.id === mod.componentId);
    return item?.definition.name ?? "item";
  }
  return group || "other";
}

/** Highest applicable "set" modifier for a subType, or null if there is none. */
function highestModifierSet(
  modifiers: Record<string, DdbModifier[]>,
  subType: string,
  inventory?: DdbInventoryItem[]
): { value: number; source: string } | null {
  let highest: ModifierBonus | null = null;
  for (const [group, list] of Object.entries(modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.type !== "set" || mod.subType !== subType) continue;
      if (group === "item" && inventory && !isActiveItemModifier(mod, inventory)) {
        continue;
      }

      const value = modifierValue(mod);
      if (value != null && (highest === null || value > highest.value)) {
        highest = { group, mod, value };
      }
    }
  }
  return highest
    ? {
        value: highest.value,
        source: modifierSource(highest.group, highest.mod, inventory),
      }
    : null;
}

export interface AbilityScoreContribution {
  source: string;
  value: number;
}

export interface AbilityScoreBreakdown {
  base: number;
  bonus: number;
  contributions: AbilityScoreContribution[];
  set: { value: number; source: string } | null;
  override: number | null;
  total: number;
}

/** Groups modifier bonuses by source so an item/feature is listed once. */
function groupContributions(
  bonuses: ModifierBonus[],
  inventory?: DdbInventoryItem[]
): AbilityScoreContribution[] {
  const bySource = new Map<string, number>();
  for (const bonus of bonuses) {
    if (bonus.value === 0) continue;
    const source = modifierSource(bonus.group, bonus.mod, inventory);
    bySource.set(source, (bySource.get(source) ?? 0) + bonus.value);
  }
  return Array.from(bySource, ([source, value]) => ({ source, value }));
}

export function computeAbilityScoreBreakdown(
  base: DdbAbilityScore[],
  bonus: DdbAbilityScore[],
  override: DdbAbilityScore[],
  modifiers: Record<string, DdbModifier[]>,
  id: number,
  inventory?: DdbInventoryItem[]
): AbilityScoreBreakdown {
  const baseValue = base.find((s) => s.id === id)?.value ?? 10;
  const overrideValue = override.find((s) => s.id === id)?.value;
  if (overrideValue !== null && overrideValue !== undefined) {
    return {
      base: baseValue,
      bonus: 0,
      contributions: [],
      set: null,
      override: overrideValue,
      total: overrideValue,
    };
  }

  const subType = ABILITY_SUBTYPE_MAP[id] ?? "";
  const bonusValue = bonus.find((s) => s.id === id)?.value ?? 0;
  const modifierBonuses = collectModifierBonuses(modifiers, subType, inventory);
  const computed =
    baseValue +
    bonusValue +
    modifierBonuses.reduce((total, item) => total + item.value, 0);

  // "set" modifiers (e.g. Gloves of Dexterity) set a floor, not a replacement.
  const highestSet = highestModifierSet(modifiers, subType, inventory);
  const appliedSet =
    highestSet !== null && highestSet.value >= computed ? highestSet : null;

  return {
    base: baseValue,
    bonus: bonusValue,
    contributions: groupContributions(modifierBonuses, inventory),
    set: appliedSet,
    override: null,
    total: appliedSet?.value ?? computed,
  };
}

export function computeFinalAbilityScore(
  base: DdbAbilityScore[],
  bonus: DdbAbilityScore[],
  override: DdbAbilityScore[],
  modifiers: Record<string, DdbModifier[]>,
  id: number,
  inventory?: DdbInventoryItem[]
): number {
  return computeAbilityScoreBreakdown(
    base,
    bonus,
    override,
    modifiers,
    id,
    inventory
  ).total;
}

export function computeLevel(char: DdbCharacter): number {
  return char.classes.reduce((sum, cls) => sum + cls.level, 0);
}

export function calculateMaxHp(char: DdbCharacter): number {
  if (char.overrideHitPoints !== null && char.overrideHitPoints !== undefined) {
    return char.overrideHitPoints;
  }

  const conMod = abilityModifier(
    computeFinalAbilityScore(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      3,
      char.inventory
    )
  );
  const level = computeLevel(char);
  const perLevelBonus = sumModifierBonuses(
    char.modifiers,
    "hit-points-per-level",
    char.inventory
  );

  return (
    char.baseHitPoints +
    (char.bonusHitPoints ?? 0) +
    conMod * level +
    perLevelBonus * level
  );
}

export function calculateCurrentHp(char: DdbCharacter): number {
  const max = calculateMaxHp(char);
  return max - char.removedHitPoints;
}

const ARMOR_TYPE_LIGHT = 1;
const ARMOR_TYPE_MEDIUM = 2;
const ARMOR_TYPE_HEAVY = 3;
const ARMOR_TYPE_SHIELD = 4;

export function calculateAc(char: DdbCharacter): number {
  const dexMod = abilityModifier(
    computeFinalAbilityScore(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      2,
      char.inventory
    )
  );
  const conMod = abilityModifier(
    computeFinalAbilityScore(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      3,
      char.inventory
    )
  );
  const wisMod = abilityModifier(
    computeFinalAbilityScore(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      5,
      char.inventory
    )
  );

  // Find equipped body armor and shields. Real armor has type null/"", so use
  // armorTypeId rather than the definition's type string. Each candidate is
  // ranked by its full AC, including armor-class modifiers the item grants.
  let bestArmorAc: number | null = null;
  let shieldAc = 0;
  let armorItemBonuses = 0;

  for (const item of char.inventory) {
    if (!item.equipped) continue;
    if (item.definition.filterType !== "Armor") continue;

    const armorClass = item.definition.armorClass ?? 10;
    const ownBonus = itemArmorClassBonus(char.modifiers, item, char.inventory);
    armorItemBonuses += ownBonus;

    switch (item.definition.armorTypeId) {
      case ARMOR_TYPE_SHIELD:
        shieldAc = Math.max(shieldAc, armorClass + ownBonus);
        break;
      case ARMOR_TYPE_LIGHT:
        bestArmorAc = Math.max(
          bestArmorAc ?? -Infinity,
          armorClass + dexMod + ownBonus
        );
        break;
      case ARMOR_TYPE_MEDIUM:
        bestArmorAc = Math.max(
          bestArmorAc ?? -Infinity,
          armorClass + Math.min(dexMod, 2) + ownBonus
        );
        break;
      case ARMOR_TYPE_HEAVY:
        bestArmorAc = Math.max(
          bestArmorAc ?? -Infinity,
          armorClass + ownBonus
        );
        break;
    }
  }

  let finalAc: number;
  if (bestArmorAc !== null) {
    finalAc = bestArmorAc;
  } else {
    // Check for unarmored defense
    const isBarbarian = char.classes.some(
      (cls) => cls.definition.name === "Barbarian"
    );
    const isMonk = char.classes.some((cls) => cls.definition.name === "Monk");

    if (isBarbarian) {
      finalAc = 10 + dexMod + conMod;
    } else if (isMonk) {
      finalAc = 10 + dexMod + wisMod;
    } else {
      finalAc = 10 + dexMod;
    }
  }

  finalAc += shieldAc;

  // Add AC modifiers from cloaks, features, and spells. Bonuses granted by
  // armor and shields are already included for the chosen items only, so
  // exclude them from the flat sum.
  finalAc +=
    sumModifierBonuses(char.modifiers, "armor-class", char.inventory) -
    armorItemBonuses +
    sumModifierBonuses(char.modifiers, "armored-armor-class", char.inventory) +
    sumModifierBonuses(char.modifiers, "unarmored-armor-class", char.inventory);

  return finalAc;
}
