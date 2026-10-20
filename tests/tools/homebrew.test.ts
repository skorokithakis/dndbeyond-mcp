import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DdbClient } from "../../src/api/client.js";
import {
  getHomebrewMagicItem,
  listHomebrewCreations,
  parseEditorSpecialEntries,
  parseHomebrewCreations,
} from "../../src/tools/homebrew.js";
import type { DdbHomebrewItem } from "../../src/types/homebrew.js";

const LIST_HTML = `
  <div class="list-row list-row-homebrew-creation list-row-homebrew-creation-Item"
       data-type="magic-items" data-slug="4910078-dazzling-cloak">
    <div class="list-row-name-primary-text">
      <a href="/homebrew/creations/view?entityTypeId=112130694&amp;id=4910078">Dazzling Cloak &amp; Co</a>
    </div>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-private">
      Private, Never Submitted
    </div>
    <div class="list-row-type-primary-text">Item</div>
  </div>
  <div class="list-row list-row-homebrew-creation list-row-homebrew-creation-Feat"
       data-type="feats" data-slug="77-sharp-mind">
    <div class="list-row-name-primary-text">
      <a href="/homebrew/creations/view?entityTypeId=1088085227&amp;id=77">Sharp Mind</a>
    </div>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-public">
      Public, Approved
    </div>
    <div class="list-row-type-primary-text">Feat</div>
  </div>
  <div class="list-row list-row-homebrew-creation list-row-homebrew-creation-Item"
       data-type="magic-items" data-slug="88-deleted-ring">
    <div class="list-row-name-primary-text">Deleted Ring</div>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-deleted">
      Deleted, Never Submitted
    </div>
    <div class="list-row-type-primary-text">Item</div>
  </div>
`;

const EDITOR_HTML = `
  <div class="ddb-homebrew-create-special ddb-homebrew-create-special-modifiers">
    <div class="ddb-homebrew-create-special-body">
      <table class="listing"><tbody>
        <tr><td>Bonus - Armor Class</td><td></td><td>3</td>
          <td><a>Edit</a> | <a>Delete</a></td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="ddb-homebrew-create-special ddb-homebrew-create-special-conditions">
    <div class="ddb-homebrew-create-special-body">
      <table class="listing"><tbody>
        <tr><td>Charmed</td><td>Applies</td>
          <td><a>Edit</a> | <a>Delete</a></td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="ddb-homebrew-create-special ddb-homebrew-create-special-spells">
    <div class="ddb-homebrew-create-special-body">
      <table class="listing"><tbody>
        <tr><td>Detect Magic</td><td>3/day</td>
          <td><a>Edit</a> | <a>Delete</a></td></tr>
      </tbody></table>
    </div>
  </div>
`;

const DAZZLING_CLOAK: DdbHomebrewItem = {
  id: 4910078,
  entityTypeId: 112130694,
  name: "Dazzling Cloak of Stealth and Beauty",
  type: "Wondrous item",
  filterType: "Wondrous item",
  rarity: "Artifact",
  isHomebrew: true,
  magic: true,
  canAttune: false,
  attunementDescription: "",
  weight: 0,
  tags: [],
  description:
    "<h3>The Dazzling Cloak</h3><p><strong>Oh Wow.</strong> This effect has no impact on creatures immune to being charmed.</p>",
  grantedModifiers: [
    {
      id: "36647899",
      type: "bonus",
      subType: "armor-class",
      friendlyTypeName: "Bonus",
      friendlySubtypeName: "Armor Class",
      fixedValue: 3,
      value: 3,
      dice: null,
      restriction: "",
    },
    {
      id: "36647924",
      entityId: 3,
      entityTypeId: 1472902489,
      type: "stacking-bonus",
      subType: "constitution-score",
      friendlyTypeName: "Stacking Bonus",
      friendlySubtypeName: "Constitution Score",
      fixedValue: 6,
      value: 6,
      dice: null,
      restriction: "",
    },
    {
      id: "59405429",
      entityId: 6,
      entityTypeId: 1472902489,
      type: "stacking-bonus",
      subType: "charisma-score",
      friendlyTypeName: "Stacking Bonus",
      friendlySubtypeName: "Charisma Score",
      fixedValue: 3,
      value: 3,
      dice: null,
      restriction: "",
    },
  ],
};

function fakeWww(html: string) {
  return {
    getHtml: vi.fn().mockResolvedValue({ html }),
  } as unknown as Parameters<typeof listHomebrewCreations>[0];
}

describe("homebrew tools", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
    vi.clearAllMocks();
  });

  describe("parseHomebrewCreations", () => {
    it("parses type, ID, and published state from the My Creations HTML", () => {
      const creations = parseHomebrewCreations(LIST_HTML);

      expect(creations).toHaveLength(3);
      expect(creations[0]).toMatchObject({
        id: 4910078,
        entityTypeId: 112130694,
        name: "Dazzling Cloak & Co",
        type: "magic-items",
        typeLabel: "Item",
        status: "private",
        published: false,
      });
      expect(creations[1]).toMatchObject({
        id: 77,
        entityTypeId: 1088085227,
        type: "feats",
        typeLabel: "Feat",
        status: "published",
        published: true,
      });
      expect(creations[2]).toMatchObject({
        id: 88,
        status: "deleted",
        published: false,
      });
    });

    it("ignores rows without a usable view link", () => {
      const creations = parseHomebrewCreations(
        '<div class="list-row-homebrew-creation"><div class="list-row-name-primary-text">No link</div></div>',
      );
      expect(creations).toEqual([]);
    });
  });

  describe("listHomebrewCreations", () => {
    it("lists private and published creations by default with type, ID, and published state", async () => {
      const www = fakeWww(LIST_HTML);
      const result = await listHomebrewCreations(www);

      const url = vi.mocked(www.getHtml).mock.calls[0][0] as string;
      expect(new URL(url).searchParams.getAll("filter-status")).toEqual(["1", "2"]);

      const text = result.content[0].text;
      expect(text).toContain("Homebrew Creations (3 found)");
      expect(text).toContain(
        "**Dazzling Cloak & Co** — Item (magic-items) · ID 4910078 · Private, Never Submitted [unpublished]",
      );
      expect(text).toContain("**Sharp Mind** — Feat (feats) · ID 77 · Public, Approved [published]");
    });

    it("includes deleted items when requested", async () => {
      const www = fakeWww(LIST_HTML);
      await listHomebrewCreations(www, { status: "all" });

      const url = vi.mocked(www.getHtml).mock.calls[0][0] as string;
      expect(new URL(url).searchParams.getAll("filter-status")).toEqual([
        "1",
        "2",
        "3",
      ]);
    });

    it("filters by status and creation type", async () => {
      const www = fakeWww(LIST_HTML);
      const result = await listHomebrewCreations(www, {
        status: "private",
        type: "magic items",
      });

      const url = vi.mocked(www.getHtml).mock.calls[0][0] as string;
      expect(new URL(url).searchParams.getAll("filter-status")).toEqual(["1"]);

      const text = result.content[0].text;
      expect(text).toContain("Dazzling Cloak & Co");
      expect(text).not.toContain("Sharp Mind");
    });

    it("reports when no creations match", async () => {
      const www = fakeWww(LIST_HTML);
      const result = await listHomebrewCreations(www, { type: "monsters" });

      expect(result.content[0].text).toBe(
        'No homebrew creations found of type "monsters".',
      );
    });

    it("returns a useful message when the page cannot be loaded", async () => {
      const www = {
        getHtml: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
      } as unknown as Parameters<typeof listHomebrewCreations>[0];

      const result = await listHomebrewCreations(www);

      expect(result.content[0].text).toBe(
        "Failed to list homebrew creations: 403 Forbidden",
      );
    });
  });

  describe("parseEditorSpecialEntries", () => {
    it("extracts conditions and spells without the Actions column", () => {
      expect(parseEditorSpecialEntries(EDITOR_HTML, "conditions")).toEqual([
        "Charmed — Applies",
      ]);
      expect(parseEditorSpecialEntries(EDITOR_HTML, "spells")).toEqual([
        "Detect Magic — 3/day",
      ]);
    });

    it("returns an empty list when the section has no entries", () => {
      const html =
        '<div class="ddb-homebrew-create-special-conditions"><a>Add a Condition</a></div>';
      expect(parseEditorSpecialEntries(html, "conditions")).toEqual([]);
    });
  });

  describe("getHomebrewMagicItem", () => {
    it("formats basic info, modifiers, conditions, and spells", async () => {
      vi.mocked(mockClient.get).mockResolvedValue([DAZZLING_CLOAK]);
      const www = fakeWww(EDITOR_HTML);

      const result = await getHomebrewMagicItem(
        mockClient,
        { itemId: 4910078 },
        www as unknown as Parameters<typeof getHomebrewMagicItem>[2],
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/game-data/items?sharingSetting=2"),
        "homebrew:items",
        60_000,
      );

      const text = result.content[0].text;
      expect(text).toContain("# Dazzling Cloak of Stealth and Beauty");
      expect(text).toContain("**ID:** 4910078");
      expect(text).toContain("**Type:** Wondrous item");
      expect(text).toContain("**Rarity:** Artifact");
      expect(text).toContain("**Requires Attunement:** No");
      expect(text).toContain("## Description");
      expect(text).toContain("Oh Wow.");
      expect(text).toContain("## Modifiers (3)");
      expect(text).toContain("**Bonus - Armor Class**: 3");
      expect(text).toContain("**Stacking Bonus - Constitution Score**: 6");
      expect(text).toContain("**Stacking Bonus - Charisma Score**: 3");
      expect(text).toContain("## Conditions");
      expect(text).toContain("- Charmed — Applies");
      expect(text).toContain("## Spells");
      expect(text).toContain("- Detect Magic — 3/day");
    });

    it("returns a staleness hint when the item is missing from game data", async () => {
      vi.mocked(mockClient.get).mockResolvedValue([]);
      const www = fakeWww(EDITOR_HTML);

      const result = await getHomebrewMagicItem(
        mockClient,
        { itemId: 999 },
        www as unknown as Parameters<typeof getHomebrewMagicItem>[2],
      );

      expect(result.content[0].text).toContain("was not found in game data");
      expect(result.content[0].text).toContain("eventually consistent");
      expect(www.getHtml).not.toHaveBeenCalled();
    });

    it("still returns game-data details when the editor page fails", async () => {
      vi.mocked(mockClient.get).mockResolvedValue([DAZZLING_CLOAK]);
      const www = {
        getHtml: vi.fn().mockRejectedValue(new Error("editor unavailable")),
      } as unknown as Parameters<typeof getHomebrewMagicItem>[2];

      const result = await getHomebrewMagicItem(
        mockClient,
        { itemId: 4910078 },
        www,
      );

      const text = result.content[0].text;
      expect(text).toContain("## Modifiers (3)");
      expect(text).toContain("_Unavailable: editor unavailable_");
    });
  });
});
