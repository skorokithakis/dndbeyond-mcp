import { parse } from "node-html-parser";
import type { DdbClient } from "../api/client.js";
import {
  DDB_WATERDEEP,
  ENDPOINTS,
  HOMEBREW_MAGIC_ITEM_ENTITY_TYPE_ID,
} from "../api/endpoints.js";
import {
  extractFormFields,
  extractFormTokens,
  getWwwClient,
  type FormFields,
  type WwwClient,
} from "../api/www.js";
import type {
  DdbHomebrewItem,
  DdbHomebrewModifier,
  HomebrewCreationStatus,
  HomebrewCreationSummary,
} from "../types/homebrew.js";
import { stripHtml } from "../utils/html.js";

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export type HomebrewListStatus = "all" | "private" | "published" | "deleted";

export interface ListHomebrewCreationsParams {
  /**
   * Filter by status. Defaults to private and published; use "deleted" or
   * "all" to include soft-deleted tombstones.
   */
  status?: HomebrewListStatus;
  /** Filter by creation type, e.g. "magic-items", "feats", or "spells". */
  type?: string;
}

export interface GetHomebrewMagicItemParams {
  itemId: number;
}

const STATUS_IDS: Record<Exclude<HomebrewListStatus, "all">, number> = {
  private: 1,
  published: 2,
  deleted: 3,
};

/** Fetcher subset needed by these read-only tools; simplifies tests. */
type HtmlClient = Pick<WwwClient, "getHtml">;

const ABILITY_NAMES: Record<number, string> = {
  1: "STR",
  2: "DEX",
  3: "CON",
  4: "INT",
  5: "WIS",
  6: "CHA",
};

const ADDITIONAL_BONUS_NAMES: Record<number, string> = {
  1: "Proficiency Bonus",
  2: "Attuned Item Count",
  3: "Spell Level",
};

function classifyStatus(statusText: string): HomebrewCreationStatus {
  const text = statusText.toLowerCase();
  if (text.includes("deleted")) return "deleted";
  if (text.includes("private")) return "private";
  if (text.includes("publish") || text.includes("public")) return "published";
  return "unknown";
}

/**
 * Parses rows from the server-rendered My Creations page.
 * The row structure is documented in docs/api-research.md.
 */
export function parseHomebrewCreations(html: string): HomebrewCreationSummary[] {
  const root = parse(html);
  const rows = root.querySelectorAll(".list-row-homebrew-creation");

  const creations: HomebrewCreationSummary[] = [];
  for (const row of rows) {
    const link = row.querySelector(".list-row-name-primary-text a");
    const href = link?.getAttribute("href") ?? "";
    const slug = row.getAttribute("data-slug") ?? "";

    let id = Number.NaN;
    let entityTypeId = Number.NaN;
    if (href) {
      try {
        const url = new URL(href, DDB_WATERDEEP);
        id = Number(url.searchParams.get("id"));
        const rawEntityTypeId = url.searchParams.get("entityTypeId");
        entityTypeId =
          rawEntityTypeId === null ? Number.NaN : Number(rawEntityTypeId);
      } catch {
        // Fall through to the slug-derived ID below.
      }
    }

    // Deleted rows do not link to the item, but their slug still starts with the ID.
    if (!Number.isInteger(id) || id <= 0) {
      const slugId = Number(slug.split("-")[0]);
      if (Number.isInteger(slugId) && slugId > 0) id = slugId;
    }
    if (!Number.isInteger(id) || id <= 0) continue;

    const name =
      row.querySelector(".list-row-name-primary-text")?.textContent.trim() ||
      "(unnamed)";
    const statusText =
      row.querySelector(".homebrew-status")?.textContent.trim() ?? "";
    const status = classifyStatus(statusText);

    creations.push({
      id,
      entityTypeId: Number.isInteger(entityTypeId) ? entityTypeId : null,
      name,
      type: row.getAttribute("data-type") ?? "",
      typeLabel:
        row.querySelector(".list-row-type-primary-text")?.textContent.trim() ??
        "",
      slug,
      statusText,
      status,
      published: status === "published" ? true : status === "unknown" ? undefined : false,
    });
  }

  return creations;
}

function normalizeType(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, "-");
}

function describePublishedState(creation: HomebrewCreationSummary): string {
  switch (creation.status) {
    case "published":
      return "published";
    case "private":
      return "unpublished";
    case "deleted":
      return "deleted";
    default:
      return "status unknown";
  }
}

/**
 * Lists the user's homebrew creations from the server-rendered My Creations page.
 * Shows the type, entity ID, and published state for each creation.
 */
export async function listHomebrewCreations(
  www: HtmlClient,
  params: ListHomebrewCreationsParams = {},
): Promise<ToolResult> {
  const status = params.status;
  const statuses =
    status === undefined
      ? [1, 2]
      : status === "all"
        ? [1, 2, 3]
        : [STATUS_IDS[status]];

  let creations: HomebrewCreationSummary[];
  try {
    const { html } = await www.getHtml(
      ENDPOINTS.homebrew.myCreations({ statuses }),
    );
    creations = parseHomebrewCreations(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: "text", text: `Failed to list homebrew creations: ${message}` },
      ],
    };
  }

  if (params.type) {
    const needle = normalizeType(params.type);
    creations = creations.filter(
      (creation) =>
        normalizeType(creation.type).includes(needle) ||
        normalizeType(creation.typeLabel).includes(needle),
    );
  }

  if (creations.length === 0) {
    const statusHint = status && status !== "all" ? ` with status "${status}"` : "";
    const typeHint = params.type ? ` of type "${params.type}"` : "";
    return {
      content: [
        {
          type: "text",
          text: `No homebrew creations found${typeHint}${statusHint}.`,
        },
      ],
    };
  }

  creations.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [`# Homebrew Creations (${creations.length} found)\n`];
  for (const creation of creations) {
    const type = creation.typeLabel || creation.type || "Unknown";
    const rawType =
      creation.type && creation.type !== type ? ` (${creation.type})` : "";
    const statusLabel = creation.statusText || "Status unknown";
    lines.push(
      `- **${creation.name}** — ${type}${rawType} · ID ${creation.id} · ${statusLabel} [${describePublishedState(creation)}]`,
    );
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Reads the Conditions or Spells list from the homebrew item editor page.
 * Both sections use the site's standard listing table; cell text is joined so
 * the output remains useful if the site adds or reorders columns.
 */
export function parseEditorSpecialEntries(
  html: string,
  section: "conditions" | "spells",
): string[] {
  const root = parse(html);
  const sectionElement = root.querySelector(
    `.ddb-homebrew-create-special-${section}`,
  );
  if (!sectionElement) return [];

  let rows = sectionElement.querySelectorAll("table tbody tr");
  if (rows.length === 0) {
    rows = sectionElement.querySelectorAll(".listing-body .listing-row");
  }

  const entries: string[] = [];
  for (const row of rows) {
    let cells = row.querySelectorAll("td");
    if (cells.length === 0) {
      cells = row.querySelectorAll(".listing-row-col");
    }

    const values = cells
      .map((cell) => cell.textContent.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0);

    // The last cell is the Actions column (Edit | Delete), not part of the entry.
    if (values.length > 1 && /^(edit|delete)\b/i.test(values[values.length - 1])) {
      values.pop();
    }

    if (values.length > 0) entries.push(values.join(" — "));
  }

  return entries;
}

function formatDice(dice: unknown): string | undefined {
  if (!dice) return undefined;
  if (typeof dice === "string") return dice;
  if (typeof dice !== "object") return undefined;

  const value = dice as Record<string, unknown>;
  if (typeof value.diceString === "string" && value.diceString) {
    return value.diceString;
  }
  if (typeof value.diceCount === "number" && typeof value.diceValue === "number") {
    return `${value.diceCount}d${value.diceValue}`;
  }
  return undefined;
}

function formatDuration(duration: unknown): string | undefined {
  if (!duration) return undefined;
  if (typeof duration === "string") return duration;
  if (typeof duration !== "object") return undefined;

  const value = duration as Record<string, unknown>;
  const interval = value.durationInterval ?? value.interval;
  const unit = value.durationUnit ?? value.unit;
  if (typeof interval === "number" && typeof unit === "string") {
    return `${interval} ${unit}${interval === 1 ? "" : "s"}`;
  }
  if (typeof value.durationType === "string") return value.durationType;
  return undefined;
}

function formatModifierValue(modifier: DdbHomebrewModifier): string | undefined {
  const dice = formatDice(modifier.dice);
  const fixed =
    typeof modifier.fixedValue === "number"
      ? modifier.fixedValue
      : typeof modifier.value === "number"
        ? modifier.value
        : undefined;

  if (dice) {
    if (
      fixed !== undefined &&
      fixed !== 0 &&
      !/[+-]\d+\s*$/.test(dice)
    ) {
      return `${dice}${fixed >= 0 ? "+" : ""}${fixed}`;
    }
    return dice;
  }
  if (typeof modifier.value === "string" && modifier.value) {
    return modifier.value;
  }
  if (fixed !== undefined) return String(fixed);
  return undefined;
}

function humanize(value: string | undefined): string {
  if (!value) return "";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatModifier(modifier: DdbHomebrewModifier): string {
  const typeName = modifier.friendlyTypeName || humanize(modifier.type) || "Modifier";
  const subtypeName =
    modifier.friendlySubtypeName || humanize(modifier.subType) || "";
  const name = subtypeName ? `${typeName} - ${subtypeName}` : typeName;

  const value = formatModifierValue(modifier);
  let line = `- **${name}**`;
  if (value) line += `: ${value}`;

  const details: string[] = [];
  if (modifier.restriction) details.push(`restriction: ${modifier.restriction}`);
  if (modifier.requiresAttunement) details.push("requires attunement");
  if (modifier.additionalBonusType) {
    const bonus = ADDITIONAL_BONUS_NAMES[modifier.additionalBonusType];
    if (bonus) details.push(`plus ${bonus}`);
  }
  const duration = formatDuration(modifier.duration);
  if (duration) details.push(`duration: ${duration}`);

  if (
    !subtypeName &&
    modifier.entityTypeId === 1472902489 &&
    typeof modifier.entityId === "number" &&
    ABILITY_NAMES[modifier.entityId]
  ) {
    details.push(`ability: ${ABILITY_NAMES[modifier.entityId]}`);
  }

  if (details.length > 0) line += ` (${details.join("; ")})`;
  return line;
}

function formatModifiers(item: DdbHomebrewItem): string[] {
  const modifiers = item.grantedModifiers ?? [];
  if (modifiers.length === 0) return ["None recorded."];
  return modifiers.map(formatModifier);
}

/**
 * Reads one homebrew magic item from character-service game data.
 * Conditions and spells are not present in game data, so they are read from
 * the item's server-rendered editor page.
 */
export async function getHomebrewMagicItem(
  client: DdbClient,
  params: GetHomebrewMagicItemParams,
  www: HtmlClient = getWwwClient(),
): Promise<ToolResult> {
  let items: DdbHomebrewItem[];
  try {
    items = await client.get<DdbHomebrewItem[]>(
      ENDPOINTS.gameData.items(),
      "homebrew:items",
      60_000,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to load homebrew magic items: ${message}`,
        },
      ],
    };
  }

  const item = (items ?? []).find(
    (candidate) =>
      candidate.id === params.itemId &&
      candidate.isHomebrew &&
      (candidate.entityTypeId === undefined ||
        candidate.entityTypeId === HOMEBREW_MAGIC_ITEM_ENTITY_TYPE_ID),
  );

  if (!item) {
    return {
      content: [
        {
          type: "text",
          text:
            `Homebrew magic item ${params.itemId} was not found in game data. ` +
            "D&D Beyond's game-data endpoint is eventually consistent, so a newly created or edited item " +
            "may take a few minutes to appear. Use list_homebrew_creations to confirm the ID, then retry.",
        },
      ],
    };
  }

  let conditions: string[] = [];
  let spells: string[] = [];
  let editorError: string | undefined;
  try {
    const { html } = await www.getHtml(ENDPOINTS.homebrew.editor(params.itemId));
    conditions = parseEditorSpecialEntries(html, "conditions");
    spells = parseEditorSpecialEntries(html, "spells");
  } catch (error) {
    editorError = error instanceof Error ? error.message : String(error);
  }

  const type = item.filterType || item.type || "Unknown";
  const requiresAttunement = item.canAttune ?? item.requiresAttunement ?? false;

  const lines: string[] = [`# ${item.name}`, ""];
  lines.push(`**ID:** ${item.id}`);
  lines.push(`**Type:** ${type}`);
  if (item.rarity) lines.push(`**Rarity:** ${item.rarity}`);
  lines.push(
    `**Requires Attunement:** ${requiresAttunement ? "Yes" : "No"}`,
  );
  if (item.attunementDescription) {
    lines.push(`**Attunement:** ${item.attunementDescription}`);
  }
  if (item.weight !== undefined && item.weight !== null) {
    lines.push(`**Weight:** ${item.weight} lb.`);
  }
  if (item.tags && item.tags.length > 0) {
    lines.push(`**Tags:** ${item.tags.join(", ")}`);
  }
  if (item.baseArmorName) lines.push(`**Base Armor:** ${item.baseArmorName}`);
  if (item.armorClass !== null && item.armorClass !== undefined) {
    lines.push(`**Armor Class:** ${item.armorClass}`);
  }
  if (item.damage?.diceString) {
    const damageType = item.damageType ? ` ${item.damageType}` : "";
    lines.push(`**Damage:** ${item.damage.diceString}${damageType}`);
  }
  if (item.properties && item.properties.length > 0) {
    lines.push(
      `**Properties:** ${item.properties.map((property) => property.name).join(", ")}`,
    );
  }

  lines.push("", "## Description", "");
  lines.push(stripHtml(item.description || item.snippet) || "_No description._");

  lines.push("", `## Modifiers (${item.grantedModifiers?.length ?? 0})`);
  lines.push(...formatModifiers(item));

  if (editorError) {
    lines.push("", "## Conditions", "");
    lines.push(`_Unavailable: ${editorError}_`);
    lines.push("", "## Spells", "");
    lines.push(`_Unavailable: ${editorError}_`);
  } else {
    lines.push("", "## Conditions");
    lines.push(conditions.length > 0 ? conditions.map((c) => `- ${c}`).join("\n") : "None recorded.");
    lines.push("", "## Spells");
    lines.push(spells.length > 0 ? spells.map((s) => `- ${s}`).join("\n") : "None recorded.");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ---------------------------------------------------------------------------
// Modifier tools
// ---------------------------------------------------------------------------

/** Subset of DdbClient used by the write tools; keeps unit tests small. */
export interface HomebrewWriteClient {
  invalidateCache(key: string): void;
  invalidateCachePrefix(prefix: string): void;
}

/**
 * Invalidates every cached character: a homebrew item can be equipped by any
 * character, so every `character:*` entry may now be stale.
 */
export function invalidateCharacterCaches(
  client: Pick<HomebrewWriteClient, "invalidateCachePrefix">,
): void {
  client.invalidateCachePrefix("character:");
}

/** Invalidates both character snapshots and the homebrew game-data list. */
export function invalidateHomebrewWriteCaches(
  client: HomebrewWriteClient,
): void {
  client.invalidateCache("homebrew:items");
  invalidateCharacterCaches(client);
}

/**
 * Refuses writes to homebrew items that are not private. Published item
 * behaviour cannot be probed safely, so the tool reads the My Creations page
 * first and never sends a write for a published (or deleted) item.
 */
export async function assertHomebrewItemWritable(
  www: HtmlClient,
  itemId: number,
): Promise<HomebrewCreationSummary> {
  const { html } = await www.getHtml(
    ENDPOINTS.homebrew.myCreations({ statuses: [1, 2, 3] }),
  );
  const item = parseHomebrewCreations(html).find(
    (creation) =>
      creation.id === itemId &&
      (creation.entityTypeId === HOMEBREW_MAGIC_ITEM_ENTITY_TYPE_ID ||
        // Deleted rows have no view link, so the entity type comes from data-type.
        (creation.entityTypeId === null && creation.type === "magic-items")),
  );

  if (!item) {
    throw new Error(
      `Homebrew magic item ${itemId} was not found in your creations (private, published, or deleted). ` +
        "Use list_homebrew_creations to confirm the ID; no changes were sent.",
    );
  }

  if (item.status === "published") {
    throw new Error(
      `Homebrew magic item ${itemId} (${item.name}) is published. ` +
        "Published homebrew items cannot be modified through this server. " +
        "Unpublish it on D&D Beyond first; no changes were sent.",
    );
  }

  if (item.status === "deleted") {
    throw new Error(
      `Homebrew magic item ${itemId} (${item.name}) is deleted. ` +
        "Restore it on D&D Beyond first; no changes were sent.",
    );
  }

  if (item.status === "unknown") {
    throw new Error(
      `Could not determine whether homebrew magic item ${itemId} (${item.name}) is published. ` +
        "The write was refused to avoid modifying a published item; check the item on D&D Beyond.",
    );
  }

  return item;
}

export interface HomebrewModifierRow {
  id: number;
  name: string;
  diceRoll?: string;
  primaryStat?: string;
  fixedValue?: string;
  restriction?: string;
  duration?: string;
}

/**
 * Parses the modifier table on a homebrew item editor page.
 * Links give the modifier IDs needed by the edit and remove tools.
 */
export function parseEditorModifiers(html: string): HomebrewModifierRow[] {
  const root = parse(html);
  const table =
    root.querySelector("table.listing-rpgentity-modifier") ??
    root.querySelector(".ddb-homebrew-create-special-modifiers table");
  if (!table) return [];

  const modifiers: HomebrewModifierRow[] = [];
  for (const row of table.querySelectorAll("tbody tr")) {
    const link = row.querySelector('a[href*="/modifier/"]');
    const href = link?.getAttribute("href") ?? "";
    const idMatch = /\/modifier\/(\d+)(?:\/0\/edit|\/delete)/.exec(href);
    if (!idMatch) continue;

    const id = Number(idMatch[1]);
    if (!Number.isInteger(id) || id <= 0) continue;

    const cells = row
      .querySelectorAll("td")
      .map((cell) => cell.textContent.replace(/\s+/g, " ").trim());

    const nonEmpty = (value: string | undefined): string | undefined =>
      value ? value : undefined;

    modifiers.push({
      id,
      name: nonEmpty(cells[0]) ?? `Modifier ${id}`,
      diceRoll: nonEmpty(cells[1]),
      primaryStat: nonEmpty(cells[2]),
      fixedValue: nonEmpty(cells[3]),
      restriction: nonEmpty(cells[4]),
      duration: nonEmpty(cells[5]),
    });
  }

  return modifiers;
}

export interface ModifierTypeOption {
  id: number;
  name: string;
}

export interface ModifierSubtypeOption {
  id: number;
  name: string;
  type: number;
}

export interface ModifierOptions {
  types: ModifierTypeOption[];
  subtypes: ModifierSubtypeOption[];
}

/**
 * The subtype table is a ~1,600 entry JSON literal embedded in the modifier
 * form. It is identical across form pages, so cache it by its source text
 * instead of hard-coding the table or re-parsing 150 KB on every write.
 */
let subtypeCache: { source: string; subtypes: ModifierSubtypeOption[] } | undefined;

/** Reads modifier types from the form select and subtypes from the page script. */
export function parseModifierOptions(html: string): ModifierOptions {
  const root = parse(html);

  const types: ModifierTypeOption[] = [];
  const typeSelect = root.querySelector('select[name="spell-modifier-type"]');
  for (const option of typeSelect?.querySelectorAll("option") ?? []) {
    const value = option.getAttribute("value");
    if (!value) continue;
    const id = Number(value);
    if (!Number.isInteger(id)) continue;
    const name = option.textContent.replace(/\s+/g, " ").trim();
    if (name) types.push({ id, name });
  }

  let subtypes: ModifierSubtypeOption[] = [];
  const script = root
    .querySelectorAll("script")
    .map((element) => element.textContent)
    .find((text) => /var\s+subTypes\s*=/.test(text));

  if (script) {
    const startMatch = /var\s+subTypes\s*=\s*/.exec(script);
    const start = (startMatch?.index ?? 0) + (startMatch?.[0].length ?? 0);
    const end = script.indexOf("]];", start);
    if (startMatch && end !== -1) {
      const source = script.slice(start, end + 2);
      if (subtypeCache?.source === source) {
        subtypes = subtypeCache.subtypes;
      } else {
        try {
          const parsed = JSON.parse(source) as unknown;
          const entries = Array.isArray(parsed) && Array.isArray(parsed[0])
            ? (parsed[0] as Array<Record<string, unknown>>)
            : [];
          subtypes = entries.flatMap((entry) => {
            const id = Number(entry.id);
            const type = Number(entry.type);
            const name = typeof entry.name === "string" ? entry.name : "";
            if (!Number.isInteger(id) || !Number.isInteger(type) || !name) {
              return [];
            }
            return [{ id, name, type }];
          });
          subtypeCache = { source, subtypes };
        } catch {
          subtypes = [];
        }
      }
    }
  }

  return { types, subtypes };
}

/** Test hook; the cache is process-wide and keyed by the embedded table text. */
export function clearModifierOptionsCache(): void {
  subtypeCache = undefined;
}

function normalizeModifierName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function describeTypes(options: ModifierOptions): string {
  return options.types
    .map((type) => `${type.name} (${type.id})`)
    .join(", ");
}

export function resolveModifierType(
  value: string | number,
  options: ModifierOptions,
): ModifierTypeOption {
  if (typeof value === "number" || /^\d+$/.test(value.trim())) {
    const id = Number(value);
    const match = options.types.find((type) => type.id === id);
    if (match) return match;
    throw new Error(
      `Unknown modifier type ID ${value}. Valid types: ${describeTypes(options)}.`,
    );
  }

  const needle = normalizeModifierName(value);
  const matches = options.types.filter(
    (type) => normalizeModifierName(type.name) === needle,
  );
  if (matches.length === 1) return matches[0];

  throw new Error(
    `Unknown modifier type "${value}". Use a numeric ID or one of: ${describeTypes(options)}.`,
  );
}

function describeSubtypes(
  subtypes: ModifierSubtypeOption[],
  type: ModifierTypeOption,
): string {
  const names = subtypes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((subtype) => `${subtype.name} (${subtype.id})`);

  const remaining = subtypes.length - names.length;
  return (
    names.join(", ") +
    (remaining > 0 ? `, and ${remaining} more` : "") +
    `. Subtypes must belong to ${type.name} (${type.id}).`
  );
}

export function resolveModifierSubtype(
  value: string | number,
  type: ModifierTypeOption,
  options: ModifierOptions,
): ModifierSubtypeOption {
  const subtypes = options.subtypes.filter(
    (subtype) => subtype.type === type.id,
  );

  if (typeof value === "number" || /^\d+$/.test(value.trim())) {
    const id = Number(value);
    const match = subtypes.find((subtype) => subtype.id === id);
    if (match) return match;
    throw new Error(
      `Unknown modifier subtype ID ${value} for ${type.name} (${type.id}). ` +
        `Valid subtypes include: ${describeSubtypes(subtypes, type)}`,
    );
  }

  const needle = normalizeModifierName(value);
  const matches = subtypes.filter(
    (subtype) => normalizeModifierName(subtype.name) === needle,
  );
  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const ids = matches.map((match) => `${match.name} (${match.id})`).join(", ");
    throw new Error(
      `Modifier subtype "${value}" is ambiguous for ${type.name} (${type.id}); use an ID: ${ids}.`,
    );
  }

  throw new Error(
    `Unknown modifier subtype "${value}" for ${type.name} (${type.id}). ` +
      `Valid subtypes include: ${describeSubtypes(subtypes, type)}`,
  );
}

const ABILITY_SCORE_IDS: Record<string, number> = {
  str: 1,
  strength: 1,
  dex: 2,
  dexterity: 2,
  con: 3,
  constitution: 3,
  int: 4,
  intelligence: 4,
  wis: 5,
  wisdom: 5,
  cha: 6,
  charisma: 6,
};

export function resolveAbilityScore(value: string | number): number {
  if (typeof value === "number" || /^\d+$/.test(value.trim())) {
    const id = Number(value);
    if (Number.isInteger(id) && id >= 1 && id <= 6) return id;
  } else {
    const id = ABILITY_SCORE_IDS[value.trim().toLowerCase()];
    if (id !== undefined) return id;
  }

  throw new Error(
    `Unknown ability score "${value}". Use 1-6 or one of STR, DEX, CON, INT, WIS, CHA.`,
  );
}

const DIE_TYPES = [4, 6, 8, 10, 12, 20];

export function resolveDieType(value: string | number): number {
  const raw = String(value).trim().toLowerCase().replace(/^d/, "");
  const sides = Number(raw);
  if (Number.isInteger(sides) && DIE_TYPES.includes(sides)) return sides;

  throw new Error(
    `Unknown die type "${value}". Use one of d4, d6, d8, d10, d12, d20 (or 4, 6, 8, 10, 12, 20).`,
  );
}

const MODIFIER_FORM_SELECTOR = "form.ddb-homebrew-create-form";

interface ModifierFormPage {
  html: string;
  action: string;
  fields: FormFields;
  options: ModifierOptions;
}

async function fetchModifierForm(
  www: HtmlClient,
  url: string,
): Promise<ModifierFormPage> {
  const { html } = await www.getHtml(url);
  const form = parse(html).querySelector(MODIFIER_FORM_SELECTOR);
  if (!form) {
    throw new Error(
      "The modifier form was not found on the page. The D&D Beyond page layout may have changed.",
    );
  }

  // Validates that both anti-forgery inputs are present.
  extractFormTokens(html, MODIFIER_FORM_SELECTOR);

  return {
    html,
    action: form.getAttribute("action") ?? url,
    fields: extractFormFields(html, MODIFIER_FORM_SELECTOR),
    options: parseModifierOptions(html),
  };
}

function setFormValue(
  fields: FormFields,
  name: string,
  value: string | undefined,
): void {
  delete fields[name];
  if (value !== undefined) fields[name] = [value];
}

function setCheckbox(
  fields: FormFields,
  name: string,
  checked: boolean | undefined,
): void {
  if (checked === undefined) return;
  setFormValue(fields, name, checked ? "y" : undefined);
}

function parseItemIdFromEditPage(html: string): number | undefined {
  const match =
    /\/homebrew\/creations\/magic-items\/(\d+)-/.exec(html) ??
    /\/magic-items\/(\d+)-/.exec(html);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function parseCurrentModifierSubtype(html: string): number | undefined {
  const match = /var\s+subTypesValue\s*=\s*(\d+)\s*;/.exec(html);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function requireModifierType(
  value: string | number | undefined,
  options: ModifierOptions,
): ModifierTypeOption {
  if (value === undefined) {
    throw new Error(
      "A modifier type is required. Pass type as a name or ID; valid types: " +
        describeTypes(options),
    );
  }
  return resolveModifierType(value, options);
}

function requireModifierSubtype(
  value: string | number | undefined,
  type: ModifierTypeOption,
  options: ModifierOptions,
): ModifierSubtypeOption {
  if (value === undefined) {
    throw new Error(
      `A modifier subtype is required for ${type.name} (${type.id}). ` +
        `Valid subtypes include: ${describeSubtypes(
          options.subtypes.filter((subtype) => subtype.type === type.id),
          type,
        )}`,
    );
  }
  return resolveModifierSubtype(value, type, options);
}

interface CommonModifierFields {
  fixedValue?: number;
  diceCount?: number;
  dieType?: string | number;
  abilityScore?: string | number;
  details?: string;
  requiresAttunement?: boolean;
}

function applyCommonModifierFields(
  fields: FormFields,
  params: CommonModifierFields,
): void {
  if (params.fixedValue !== undefined) {
    if (!Number.isFinite(params.fixedValue)) {
      throw new Error("fixedValue must be a number.");
    }
    setFormValue(fields, "fixed-value", String(params.fixedValue));
  }

  if (params.diceCount !== undefined) {
    if (!Number.isInteger(params.diceCount) || params.diceCount < 0) {
      throw new Error("diceCount must be a non-negative integer.");
    }
    setFormValue(fields, "dice-count", String(params.diceCount));
  }

  if (params.dieType !== undefined) {
    setFormValue(fields, "dice-value", String(resolveDieType(params.dieType)));
  }

  if (params.abilityScore !== undefined) {
    setFormValue(fields, "rpg-stat", String(resolveAbilityScore(params.abilityScore)));
  }

  if (params.details !== undefined) {
    const details = params.details.trim();
    if (details.length === 1 || details.length > 512) {
      throw new Error(
        "details must be empty or between 2 and 512 characters (D&D Beyond validates this field).",
      );
    }
    setFormValue(fields, "restriction", details);
  }

  setCheckbox(fields, "requires-attunement", params.requiresAttunement);
}

function encodeForm(fields: FormFields): string {
  const body = new URLSearchParams();
  for (const [name, values] of Object.entries(fields)) {
    for (const value of values) body.append(name, value);
  }
  return body.toString();
}

async function postModifierForm(
  www: WriteWwwClient,
  url: string,
  fields: FormFields,
): Promise<Response> {
  // Form writes are not idempotent: never route these through a retry helper.
  return www.request(url, {
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(fields),
    followRedirects: false,
  });
}

/**
 * Extracts server-side validation messages from a re-rendered form page.
 */
export function extractFormError(html: string): string | undefined {
  const root = parse(html);
  const selectors = [
    ".validation-summary-errors li",
    ".validation-summary-errors",
    ".field-validation-error",
    // D&D Beyond's server-rendered field errors (seen on rejected creates).
    ".field-errors",
    ".alert-danger",
    ".alert",
  ];

  for (const selector of selectors) {
    const messages = root
      .querySelectorAll(selector)
      .map((element) => element.textContent.replace(/\s+/g, " ").trim())
      .filter((message) => message.length > 0);
    if (messages.length > 0) return messages.slice(0, 3).join(" ");
  }

  return undefined;
}

async function describeFailedPost(
  response: Response,
  action: string,
  fallback?: string,
): Promise<string> {
  const text = await response.text().catch(() => "");
  const detail = extractFormError(text);
  const status = `HTTP ${response.status}${
    response.statusText ? ` ${response.statusText}` : ""
  }`;
  const suffix = detail ? ` ${detail}` : fallback ? ` ${fallback}` : "";
  return `${action} failed (${status}).${suffix}`;
}

async function requireModifierSaved(
  response: Response,
  action: string,
): Promise<void> {
  if (response.status === 302 || response.status === 303) {
    const location = response.headers.get("location") ?? "";
    await response.body?.cancel();
    if (/sign-in/i.test(location)) {
      throw new Error(
        "Your D&D Beyond session appears to be signed out. Run setup_auth and try again.",
      );
    }
    return;
  }

  throw new Error(await describeFailedPost(response, action));
}

export interface ListHomebrewModifiersParams {
  itemId: number;
}

/**
 * Lists a homebrew magic item's modifiers from its editor page (the same list
 * the website shows). Returns modifier IDs for the edit and remove tools.
 */
export async function listHomebrewMagicItemModifiers(
  www: HtmlClient,
  params: ListHomebrewModifiersParams,
): Promise<ToolResult> {
  let modifiers: HomebrewModifierRow[];
  try {
    const { html } = await www.getHtml(ENDPOINTS.homebrew.editor(params.itemId));
    modifiers = parseEditorModifiers(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to list modifiers for homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }

  if (modifiers.length === 0) {
    return {
      content: [
        {
          type: "text",
          text:
            `Homebrew magic item ${params.itemId} has no modifiers. ` +
            "Use add_homebrew_magic_item_modifier to add one.",
        },
      ],
    };
  }

  const lines = [
    `# Modifiers for homebrew magic item ${params.itemId} (${modifiers.length})\n`,
  ];
  for (const modifier of modifiers) {
    const details = [`ID ${modifier.id}`];
    if (modifier.diceRoll) details.push(`dice ${modifier.diceRoll}`);
    if (modifier.primaryStat) details.push(`primary stat ${modifier.primaryStat}`);
    if (modifier.fixedValue) details.push(`fixed value ${modifier.fixedValue}`);
    if (modifier.restriction) details.push(`details: ${modifier.restriction}`);
    if (modifier.duration) details.push(`duration: ${modifier.duration}`);
    lines.push(`- **${modifier.name}** — ${details.join(" · ")}`);
  }

  lines.push(
    "",
    "Use edit_homebrew_magic_item_modifier with the modifier ID to change one, or remove_homebrew_magic_item_modifier to delete it.",
  );
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export interface AddHomebrewModifierParams extends CommonModifierFields {
  itemId: number;
  type: string | number;
  subtype: string | number;
}

/** Fetcher subset needed by the write tools; simplifies tests. */
export type WriteWwwClient = Pick<
  WwwClient,
  "getHtml" | "request" | "getRequestVerificationToken"
>;

/**
 * Adds a modifier to a private homebrew magic item. No item re-save is needed:
 * modifiers are separate entities that take effect immediately.
 */
export async function addHomebrewMagicItemModifier(
  client: HomebrewWriteClient,
  params: AddHomebrewModifierParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    await assertHomebrewItemWritable(www, params.itemId);

    const page = await fetchModifierForm(
      www,
      ENDPOINTS.homebrew.modifierCreate(params.itemId),
    );
    const type = requireModifierType(params.type, page.options);
    const subtype = requireModifierSubtype(params.subtype, type, page.options);

    setFormValue(page.fields, "spell-modifier-type", String(type.id));
    setFormValue(page.fields, "spell-modifier-sub-type", String(subtype.id));
    applyCommonModifierFields(page.fields, params);

    const response = await postModifierForm(www, page.action, page.fields);
    await requireModifierSaved(response, "Adding the modifier");

    invalidateHomebrewWriteCaches(client);

    return {
      content: [
        {
          type: "text",
          text:
            `Added modifier ${type.name} - ${subtype.name} to homebrew magic item ${params.itemId}. ` +
            "Modifiers are separate entities, so the item does not need to be saved again. " +
            "Use list_homebrew_magic_item_modifiers to see its new ID. " +
            "D&D Beyond's game-data reads are eventually consistent, so other tools may show the change after a short delay.",
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to add modifier to homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}

export interface EditHomebrewModifierParams extends CommonModifierFields {
  itemId: number;
  modifierId: number;
  type?: string | number;
  subtype?: string | number;
}

/**
 * Edits a modifier. The existing form is loaded first so fields the caller did
 * not pass (duration, additional bonus type, ...) are preserved.
 */
export async function editHomebrewMagicItemModifier(
  client: HomebrewWriteClient,
  params: EditHomebrewModifierParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    await assertHomebrewItemWritable(www, params.itemId);

    const page = await fetchModifierForm(
      www,
      ENDPOINTS.homebrew.modifierEdit(params.modifierId),
    );

    const pageItemId = parseItemIdFromEditPage(page.html);
    if (pageItemId !== undefined && pageItemId !== params.itemId) {
      throw new Error(
        `Modifier ${params.modifierId} belongs to homebrew magic item ${pageItemId}, not ${params.itemId}. No changes were sent.`,
      );
    }
    if (pageItemId === undefined) {
      const { html } = await www.getHtml(ENDPOINTS.homebrew.editor(params.itemId));
      if (!parseEditorModifiers(html).some((row) => row.id === params.modifierId)) {
        throw new Error(
          `Modifier ${params.modifierId} was not found on homebrew magic item ${params.itemId}. No changes were sent.`,
        );
      }
    }

    const currentTypeValue = page.fields["spell-modifier-type"]?.[0];
    const currentType = requireModifierType(currentTypeValue, page.options);

    const effectiveType =
      params.type === undefined
        ? currentType
        : resolveModifierType(params.type, page.options);

    const currentSubtypeId = parseCurrentModifierSubtype(page.html);
    const subtypeValue = params.subtype ?? currentSubtypeId;
    const subtype = requireModifierSubtype(
      subtypeValue,
      effectiveType,
      page.options,
    );

    setFormValue(page.fields, "spell-modifier-type", String(effectiveType.id));
    setFormValue(page.fields, "spell-modifier-sub-type", String(subtype.id));
    applyCommonModifierFields(page.fields, params);

    const response = await postModifierForm(www, page.action, page.fields);
    await requireModifierSaved(response, "Editing the modifier");

    invalidateHomebrewWriteCaches(client);

    return {
      content: [
        {
          type: "text",
          text:
            `Updated modifier ${params.modifierId} on homebrew magic item ${params.itemId} ` +
            `(${effectiveType.name} - ${subtype.name}). Fields you did not pass were preserved.`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to edit modifier ${params.modifierId} on homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}

export interface RemoveHomebrewModifierParams {
  itemId: number;
  modifierId: number;
}

/**
 * Deletes a modifier from a homebrew magic item. Destructive and irreversible
 * through this server.
 */
export async function removeHomebrewMagicItemModifier(
  client: HomebrewWriteClient,
  params: RemoveHomebrewModifierParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    await assertHomebrewItemWritable(www, params.itemId);

    const { html } = await www.getHtml(ENDPOINTS.homebrew.editor(params.itemId));
    const modifier = parseEditorModifiers(html).find(
      (row) => row.id === params.modifierId,
    );
    if (!modifier) {
      throw new Error(
        `Modifier ${params.modifierId} was not found on homebrew magic item ${params.itemId}. No changes were sent.`,
      );
    }

    const token = await www.getRequestVerificationToken();
    const body = new URLSearchParams({
      "request-verification-token": token,
    }).toString();

    // AJAX delete: not idempotent, so no retry helper.
    const response = await www.request(
      ENDPOINTS.homebrew.modifierDelete(params.modifierId),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        followRedirects: false,
      },
    );

    if (!response.ok) {
      throw new Error(await describeFailedPost(response, "Removing the modifier"));
    }
    await response.body?.cancel();

    invalidateHomebrewWriteCaches(client);

    return {
      content: [
        {
          type: "text",
          text:
            `Removed modifier ${params.modifierId} (${modifier.name}) from homebrew magic item ${params.itemId}. ` +
            "This change cannot be undone through this server.",
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to remove modifier ${params.modifierId} from homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Item create/update/delete tools
// ---------------------------------------------------------------------------

const ITEM_FORM_SELECTOR = "form.ddb-homebrew-create-form";

export interface HomebrewItemSelectOption {
  value: string;
  name: string;
  selected: boolean;
}

/** Reads the real option list from a form select so IDs never drift. */
export function parseSelectOptions(
  html: string,
  selectName: string,
): HomebrewItemSelectOption[] {
  const select = parse(html).querySelector(`select[name="${selectName}"]`);
  if (!select) return [];

  return select.querySelectorAll("option").map((option) => ({
    value: option.getAttribute("value") ?? "",
    name: option.textContent.replace(/\s+/g, " ").trim(),
    selected: option.hasAttribute("selected"),
  }));
}

function describeOptions(options: HomebrewItemSelectOption[]): string {
  return options
    .filter((option) => option.value !== "")
    .map((option) => `${option.name} (${option.value})`)
    .join(", ");
}

function resolveFormOption(
  value: string | number,
  options: HomebrewItemSelectOption[],
  label: string,
): string {
  if (options.length === 0) {
    throw new Error(
      `Could not read the ${label} options from the D&D Beyond form. The page layout may have changed; no changes were sent.`,
    );
  }

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const match = options.find((option) => option.value === raw);
    if (match) return match.value;
    throw new Error(
      `Unknown ${label} ID ${raw}. Valid values: ${describeOptions(options)}.`,
    );
  }

  const needle = normalizeModifierName(raw);
  const matches = options.filter(
    (option) =>
      option.value !== "" && normalizeModifierName(option.name) === needle,
  );

  if (matches.length === 1) return matches[0].value;
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous ${label} "${value}". Use an ID: ${matches
        .map((option) => `${option.name} (${option.value})`)
        .join(", ")}.`,
    );
  }

  throw new Error(
    `Unknown ${label} "${value}". Valid values: ${describeOptions(options)}.`,
  );
}

/** Accepts HTML; plain text is escaped and wrapped in paragraphs. */
export function normalizeItemDescription(value: string): string {
  if (value.trim() === "") return "";
  if (/<[a-z!/][^>]*>/i.test(value)) return value;

  return value
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => {
      const escaped = paragraph
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r?\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");
}

export interface HomebrewMagicItemFields {
  name?: string;
  /** HTML. Plain text without tags is wrapped in <p> tags. */
  description?: string;
  rarity?: string | number;
  /** Magic item type: Wondrous Item, Ring, Potion, Rod, Scroll, Staff, Wand. */
  type?: string | number;
  weight?: number;
  requiresAttunement?: boolean;
  attunementDescription?: string;
  notes?: string;
  version?: string;
}

export interface CreateHomebrewMagicItemParams extends HomebrewMagicItemFields {
  /**
   * Create from an existing magic item instead of from scratch. Accepts the
   * template definition ID or its exact name (e.g. "Amulet of Health").
   */
  templateItemId?: number | string;
}

export interface UpdateHomebrewMagicItemParams extends HomebrewMagicItemFields {
  itemId: number;
}

export interface DeleteHomebrewMagicItemParams {
  itemId: number;
}

function hasItemFields(params: HomebrewMagicItemFields): boolean {
  return (
    params.name !== undefined ||
    params.description !== undefined ||
    params.rarity !== undefined ||
    params.type !== undefined ||
    params.weight !== undefined ||
    params.requiresAttunement !== undefined ||
    params.attunementDescription !== undefined ||
    params.notes !== undefined ||
    params.version !== undefined
  );
}

function requireItemName(value: string | undefined, action: string): string {
  const name = value?.trim();
  if (!name) {
    throw new Error(`A non-empty name is required to ${action}. No changes were sent.`);
  }
  return name;
}

interface ApplyItemFieldsOptions {
  /** Skip fields the form does not contain (create page lacks weight/notes). */
  skipMissing?: boolean;
}

function applyItemFields(
  fields: FormFields,
  params: HomebrewMagicItemFields,
  html: string,
  options: ApplyItemFieldsOptions = {},
): void {
  const has = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(fields, name);

  if (params.name !== undefined) {
    setFormValue(fields, "name", requireItemName(params.name, "save the item"));
  }

  if (params.description !== undefined) {
    const description = normalizeItemDescription(params.description);
    // The server persists item-description-wysiwyg when type is WYSIWYG;
    // item-description is kept in sync for the Raw HTML mode.
    setFormValue(fields, "item-description-wysiwyg", description);
    setFormValue(fields, "item-description", description);
  }

  if (params.rarity !== undefined) {
    setFormValue(
      fields,
      "rarity",
      resolveFormOption(params.rarity, parseSelectOptions(html, "rarity"), "rarity"),
    );
  }

  if (params.type !== undefined) {
    setFormValue(
      fields,
      "type",
      resolveFormOption(params.type, parseSelectOptions(html, "type"), "item type"),
    );
  }

  if (params.weight !== undefined) {
    if (!Number.isFinite(params.weight) || params.weight < 0) {
      throw new Error("weight must be a non-negative number.");
    }
    if (!has("weight") && !options.skipMissing) {
      throw new Error(
        "This form does not have a weight field. Create the item first, then use update_homebrew_magic_item.",
      );
    }
    if (has("weight")) setFormValue(fields, "weight", String(params.weight));
  }

  if (params.requiresAttunement !== undefined) {
    setCheckbox(fields, "requires-attunement", params.requiresAttunement);
  }

  if (params.attunementDescription !== undefined) {
    setFormValue(
      fields,
      "attunement-description",
      params.attunementDescription.trim(),
    );
  }

  if (params.notes !== undefined) {
    if (!has("notes") && !options.skipMissing) {
      throw new Error(
        "This form does not have a notes field. Create the item first, then use update_homebrew_magic_item.",
      );
    }
    if (has("notes")) setFormValue(fields, "notes", params.notes);
  }

  if (params.version !== undefined) {
    setFormValue(fields, "version", params.version.trim());
  }
}

interface ItemFormPage {
  html: string;
  action: string;
  fields: FormFields;
}

async function fetchItemForm(
  www: WriteWwwClient,
  url: string,
): Promise<ItemFormPage> {
  const { html, url: finalUrl } = await www.getHtml(url);
  const form = parse(html).querySelector(ITEM_FORM_SELECTOR);
  if (!form) {
    throw new Error(
      "The homebrew item form was not found on the page. The D&D Beyond page layout may have changed.",
    );
  }

  // Validates that both anti-forgery inputs are present.
  extractFormTokens(html, ITEM_FORM_SELECTOR);

  return {
    html,
    action: form.getAttribute("action") ?? finalUrl ?? url,
    fields: extractFormFields(html, ITEM_FORM_SELECTOR),
  };
}

function fieldsToFormData(fields: FormFields): FormData {
  const body = new FormData();
  for (const [name, values] of Object.entries(fields)) {
    for (const value of values) body.append(name, value);
  }
  return body;
}

async function postItemForm(
  www: WriteWwwClient,
  url: string,
  fields: FormFields,
): Promise<Response> {
  // Homebrew form writes are not idempotent: never route them through a retry helper.
  return www.request(url, {
    method: "POST",
    headers: { Accept: "text/html,application/xhtml+xml" },
    body: fieldsToFormData(fields),
    followRedirects: false,
  });
}

/** Extracts a new or edited item ID from a create/edit redirect Location. */
export function parseItemIdFromLocation(location: string): number | undefined {
  let url: URL;
  try {
    url = new URL(location, DDB_WATERDEEP);
  } catch {
    return undefined;
  }

  const fromQuery = Number(url.searchParams.get("id"));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;

  const match = /\/magic-items\/(\d+)(?:-|\/|$)/.exec(url.pathname);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function isSuccessRedirect(response: Response): boolean {
  return response.status === 302 || response.status === 303;
}

async function requireItemCreated(
  response: Response,
  action: string,
  fallback?: string,
): Promise<number> {
  if (isSuccessRedirect(response)) {
    const location = response.headers.get("location") ?? "";
    await response.body?.cancel();
    if (/sign-in/i.test(location)) {
      throw new Error(
        "Your D&D Beyond session appears to be signed out. Run setup_auth and try again. No item was created.",
      );
    }
    const itemId = parseItemIdFromLocation(location);
    if (itemId === undefined) {
      throw new Error(
        `${action} returned a redirect without an item ID (${location || "no Location header"}). ` +
          "Check My Creations on D&D Beyond before retrying; the item may have been created.",
      );
    }
    return itemId;
  }

  throw new Error(await describeFailedPost(response, action, fallback));
}

async function requireItemUpdated(
  response: Response,
  action: string,
): Promise<void> {
  if (isSuccessRedirect(response)) {
    const location = response.headers.get("location") ?? "";
    await response.body?.cancel();
    if (/sign-in/i.test(location)) {
      throw new Error(
        "Your D&D Beyond session appears to be signed out. Run setup_auth and try again.",
      );
    }
    return;
  }

  throw new Error(await describeFailedPost(response, action));
}

interface ItemUpdates {
  itemId: number;
  fields: HomebrewMagicItemFields;
}

/** Shared update path; throws so callers can add context. */
async function updateItemFields(
  client: HomebrewWriteClient,
  { itemId, fields }: ItemUpdates,
  www: WriteWwwClient,
): Promise<void> {
  await assertHomebrewItemWritable(www, itemId);

  const page = await fetchItemForm(www, ENDPOINTS.homebrew.editor(itemId));
  applyItemFields(page.fields, fields, page.html);

  const response = await postItemForm(www, page.action, page.fields);
  await requireItemUpdated(response, "Saving the item");

  invalidateHomebrewWriteCaches(client);
}

function resolveTemplateItemId(
  value: number | string,
  options: HomebrewItemSelectOption[],
): { id: string; name: string } {
  if (options.length === 0) {
    throw new Error(
      "Could not read the magic item template list from D&D Beyond. The page layout may have changed; no item was created.",
    );
  }

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const match = options.find((option) => option.value === raw);
    if (match) return { id: match.value, name: match.name };
    throw new Error(
      `Template item ID ${raw} was not found in D&D Beyond's magic item template list. ` +
        "Pass a template definition ID or an exact template name; no item was created.",
    );
  }

  const needle = normalizeModifierName(raw);
  const matches = options.filter(
    (option) => option.value !== "" && normalizeModifierName(option.name) === needle,
  );
  if (matches.length === 1) return { id: matches[0].value, name: matches[0].name };
  if (matches.length > 1) {
    throw new Error(
      `Template item "${value}" is ambiguous. Use an ID: ${matches
        .map((option) => `${option.name} (${option.value})`)
        .join(", ")}.`,
    );
  }

  throw new Error(
    `Template item "${value}" was not found in D&D Beyond's magic item template list. ` +
      "Use the exact template name or its definition ID; no item was created.",
  );
}

/**
 * Creates a homebrew magic item, from scratch or as a copy of an existing
 * template. Template copies are named COPY_OF_<template> by D&D Beyond; pass
 * `name` to rename the copy in the same call.
 */
export async function createHomebrewMagicItem(
  client: HomebrewWriteClient,
  params: CreateHomebrewMagicItemParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    if (params.templateItemId !== undefined) {
      return await createFromTemplate(client, params, www);
    }

    if (!params.name?.trim()) {
      throw new Error(
        "A non-empty name is required when creating an item from scratch. No item was created.",
      );
    }

    // D&D Beyond marks both description fields data-validation-required and
    // rejects a scratch create without one; fail before POSTing.
    if (!params.description?.trim()) {
      throw new Error(
        "A description is required when creating an item from scratch; D&D Beyond rejects scratch creates without one. No item was created.",
      );
    }

    const createUrl = ENDPOINTS.homebrew.createMagicItemScratch();
    const page = await fetchItemForm(www, createUrl);
    applyItemFields(page.fields, params, page.html, { skipMissing: true });

    const response = await postItemForm(www, page.action, page.fields);
    const itemId = await requireItemCreated(
      response,
      "Creating the item",
      "D&D Beyond returned no validation message. A description is required when creating an item from scratch; check the form values.",
    );

    invalidateHomebrewWriteCaches(client);

    const deferred: HomebrewMagicItemFields = {};
    if (params.weight !== undefined) deferred.weight = params.weight;
    if (params.notes !== undefined) deferred.notes = params.notes;

    let deferredNote = "";
    if (hasItemFields(deferred)) {
      try {
        await updateItemFields(client, { itemId, fields: deferred }, www);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text:
                `Created homebrew magic item ${itemId}, but could not set weight/notes: ${message} ` +
                "The item exists; use update_homebrew_magic_item to finish the edit.",
            },
          ],
        };
      }
      deferredNote =
        " The weight/notes you passed were applied with a follow-up save.";
    }

    return {
      content: [
        {
          type: "text",
          text:
            `Created homebrew magic item ${itemId} ("${params.name.trim()}") from scratch.` +
            deferredNote +
            " D&D Beyond's game-data reads are eventually consistent, so other tools may show it after a short delay.",
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to create homebrew magic item: ${message}`,
        },
      ],
    };
  }
}

async function createFromTemplate(
  client: HomebrewWriteClient,
  params: CreateHomebrewMagicItemParams,
  www: WriteWwwClient,
): Promise<ToolResult> {
  if (params.name !== undefined && !params.name.trim()) {
    throw new Error(
      "A non-empty name is required when creating from a template. No item was created.",
    );
  }

  const templateUrl = ENDPOINTS.homebrew.createMagicItem();
  const { html, url: finalUrl } = await www.getHtml(templateUrl);

  const root = parse(html);
  const form = root
    .querySelector('select[name="magic-item"]')
    ?.closest("form");
  if (!form) {
    throw new Error(
      "The magic item template form was not found on the page. The D&D Beyond page layout may have changed; no item was created.",
    );
  }

  const formHtml = form.toString();
  const fields = extractFormFields(formHtml);
  extractFormTokens(formHtml);

  const template = resolveTemplateItemId(
    params.templateItemId as number | string,
    parseSelectOptions(formHtml, "magic-item"),
  );
  setFormValue(fields, "magic-item", template.id);

  // Template creation is urlencoded (unlike the multipart scratch/edit forms).
  const response = await www.request(form.getAttribute("action") ?? finalUrl ?? templateUrl, {
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(fields),
    followRedirects: false,
  });

  const itemId = await requireItemCreated(
    response,
    `Creating an item from template "${template.name}"`,
  );
  invalidateHomebrewWriteCaches(client);

  const overrides: HomebrewMagicItemFields = {};
  if (params.name !== undefined) overrides.name = params.name;
  if (params.description !== undefined) overrides.description = params.description;
  if (params.rarity !== undefined) overrides.rarity = params.rarity;
  if (params.type !== undefined) overrides.type = params.type;
  if (params.weight !== undefined) overrides.weight = params.weight;
  if (params.requiresAttunement !== undefined) {
    overrides.requiresAttunement = params.requiresAttunement;
  }
  if (params.attunementDescription !== undefined) {
    overrides.attunementDescription = params.attunementDescription;
  }
  if (params.notes !== undefined) overrides.notes = params.notes;
  if (params.version !== undefined) overrides.version = params.version;

  let overrideNote: string;
  if (hasItemFields(overrides)) {
    try {
      await updateItemFields(client, { itemId, fields: overrides }, www);
      overrideNote = " The fields you passed were applied with a follow-up save.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text:
              `Created homebrew magic item ${itemId} from template "${template.name}", but could not apply your fields: ${message} ` +
              "The item exists as a template copy; use update_homebrew_magic_item to rename or edit it.",
          },
        ],
      };
    }
  } else {
    overrideNote =
      " D&D Beyond names template copies COPY_OF_<template>; use update_homebrew_magic_item to rename it.";
  }

  return {
    content: [
      {
        type: "text",
        text:
          `Created homebrew magic item ${itemId} from template "${template.name}".` +
          overrideNote +
          " D&D Beyond's game-data reads are eventually consistent, so other tools may show it after a short delay.",
      },
    ],
  };
}

/**
 * Updates a homebrew magic item's basic fields. The server-rendered edit form
 * is loaded and resubmitted in full, so fields the caller did not pass keep
 * their current values.
 */
export async function updateHomebrewMagicItem(
  client: HomebrewWriteClient,
  params: UpdateHomebrewMagicItemParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    const fields: HomebrewMagicItemFields = {};
    if (params.name !== undefined) fields.name = params.name;
    if (params.description !== undefined) fields.description = params.description;
    if (params.rarity !== undefined) fields.rarity = params.rarity;
    if (params.type !== undefined) fields.type = params.type;
    if (params.weight !== undefined) fields.weight = params.weight;
    if (params.requiresAttunement !== undefined) {
      fields.requiresAttunement = params.requiresAttunement;
    }
    if (params.attunementDescription !== undefined) {
      fields.attunementDescription = params.attunementDescription;
    }
    if (params.notes !== undefined) fields.notes = params.notes;
    if (params.version !== undefined) fields.version = params.version;

    if (!hasItemFields(fields)) {
      throw new Error(
        "No changes were requested. Pass at least one field to update; no changes were sent.",
      );
    }

    await updateItemFields(client, { itemId: params.itemId, fields }, www);

    return {
      content: [
        {
          type: "text",
          text:
            `Updated homebrew magic item ${params.itemId}. Fields you did not pass were preserved. ` +
            "Cached character data was invalidated. D&D Beyond's game-data reads are eventually consistent, so other tools may show the change after a short delay.",
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to update homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}

/**
 * Soft-deletes a homebrew magic item: it moves to D&D Beyond's Deleted filter
 * and disappears from characters. This server cannot restore it.
 */
export async function deleteHomebrewMagicItem(
  client: HomebrewWriteClient,
  params: DeleteHomebrewMagicItemParams,
  www: WriteWwwClient = getWwwClient(),
): Promise<ToolResult> {
  try {
    await assertHomebrewItemWritable(www, params.itemId);

    const token = await www.getRequestVerificationToken();
    const body = new URLSearchParams({
      "request-verification-token": token,
    }).toString();

    // AJAX delete: not idempotent, so no retry helper.
    const response = await www.request(ENDPOINTS.homebrew.deleteItem(params.itemId), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      followRedirects: false,
    });

    if (!response.ok) {
      throw new Error(await describeFailedPost(response, "Deleting the item"));
    }
    await response.body?.cancel();

    invalidateHomebrewWriteCaches(client);

    return {
      content: [
        {
          type: "text",
          text:
            `Deleted homebrew magic item ${params.itemId}. ` +
            "On D&D Beyond this is a soft delete: the item moves to the Deleted filter and can be restored on the site. " +
            "This server cannot restore it, so treat it as permanent. Cached character data was invalidated.",
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to delete homebrew magic item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}
