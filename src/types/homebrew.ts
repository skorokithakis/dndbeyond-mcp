export interface DdbHomebrewModifier {
  id: string | number;
  entityId?: number | null;
  entityTypeId?: number | null;
  type?: string;
  subType?: string;
  dice?: unknown;
  restriction?: string;
  statId?: number | null;
  requiresAttunement?: boolean;
  duration?: unknown;
  friendlyTypeName?: string;
  friendlySubtypeName?: string;
  isGranted?: boolean;
  bonusTypes?: unknown[];
  value?: number | string | null;
  fixedValue?: number | null;
  modifierTypeId?: number;
  modifierSubTypeId?: number;
  additionalBonusType?: number | null;
  tagConstraints?: unknown[];
}

/** Homebrew magic item definition returned by game-data/items. */
export interface DdbHomebrewItem {
  id: number;
  entityTypeId?: number;
  name: string;
  type?: string;
  filterType?: string;
  description?: string;
  snippet?: string;
  rarity?: string;
  isHomebrew: boolean;
  magic?: boolean;
  canAttune?: boolean;
  requiresAttunement?: boolean;
  attunementDescription?: string;
  weight?: number;
  tags?: string[];
  grantedModifiers?: DdbHomebrewModifier[];
  baseItemId?: number | null;
  baseArmorName?: string | null;
  armorClass?: number | null;
  damage?: { diceString?: string } | null;
  damageType?: string | null;
  properties?: Array<{ name: string }> | null;
  sourceId?: number | null;
  sources?: Array<{ sourceId: number }>;
  isCustomItem?: boolean;
  version?: string;
  cost?: number | null;
}

export type HomebrewCreationStatus =
  | "private"
  | "published"
  | "deleted"
  | "unknown";

export interface HomebrewCreationSummary {
  id: number;
  entityTypeId: number | null;
  name: string;
  /** Raw data-type attribute, e.g. "magic-items". */
  type: string;
  /** Display type from the row, e.g. "Item". */
  typeLabel: string;
  slug: string;
  /** Raw status text from the row, e.g. "Private, Never Submitted". */
  statusText: string;
  status: HomebrewCreationStatus;
  /**
   * Published state when it can be derived from the status text. Undefined
   * means the site returned a status this tool does not recognise.
   */
  published: boolean | undefined;
}
