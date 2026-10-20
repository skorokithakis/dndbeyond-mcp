import type { DdbCharacter } from "../types/character.js";
import {
  ABILITY_NAMES,
  calculateAbilityModifier,
  computeAbilityScoreBreakdown,
  type AbilityScoreBreakdown,
} from "./character-calculations.js";

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** Formats the source breakdown appended to an ability score. */
export function formatAbilityBreakdown(breakdown: AbilityScoreBreakdown): string {
  if (breakdown.override !== null) {
    return ` [override ${breakdown.override}]`;
  }

  const parts = [`base ${breakdown.base}`];

  // bonusStats have no source, so label them as "other".
  if (breakdown.bonus !== 0) parts.push(`${signed(breakdown.bonus)} other`);

  for (const contribution of breakdown.contributions) {
    parts.push(`${signed(contribution.value)} ${contribution.source}`);
  }

  if (breakdown.set) {
    parts.push(`set ${breakdown.set.value} (${breakdown.set.source})`);
  }

  return parts.length > 1 ? ` [${parts.join(", ")}]` : "";
}

/** Shared ability score line used by both the character tool and resource. */
export function formatAbilityScores(char: DdbCharacter): string {
  return ABILITY_NAMES.map((name, idx) => {
    const id = idx + 1;
    const breakdown = computeAbilityScoreBreakdown(
      char.stats,
      char.bonusStats,
      char.overrideStats,
      char.modifiers,
      id,
      char.inventory
    );
    return `${name}: ${breakdown.total} (${calculateAbilityModifier(
      breakdown.total
    )})${formatAbilityBreakdown(breakdown)}`;
  }).join(" | ");
}
