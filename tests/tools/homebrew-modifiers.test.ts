import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addHomebrewMagicItemModifier,
  assertHomebrewItemWritable,
  clearModifierOptionsCache,
  editHomebrewMagicItemModifier,
  invalidateCharacterCaches,
  invalidateHomebrewWriteCaches,
  listHomebrewMagicItemModifiers,
  parseEditorModifiers,
  parseModifierOptions,
  removeHomebrewMagicItemModifier,
  resolveAbilityScore,
  resolveDieType,
  resolveModifierSubtype,
  resolveModifierType,
  type HomebrewWriteClient,
  type WriteWwwClient,
} from "../../src/tools/homebrew.js";

const MY_CREATIONS_HTML = `
  <div class="list-row list-row-homebrew-creation" data-type="magic-items"
       data-slug="100-test-item">
    <div class="list-row-name-primary-text">
      <a href="/homebrew/creations/view?entityTypeId=112130694&amp;id=100">Test Item</a>
    </div>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-private">
      Private, Never Submitted
    </div>
  </div>
  <div class="list-row list-row-homebrew-creation" data-type="magic-items"
       data-slug="200-published-item">
    <div class="list-row-name-primary-text">
      <a href="/homebrew/creations/view?entityTypeId=112130694&amp;id=200">Published Item</a>
    </div>
    <div class="list-row-name-secondary-text homebrew-status homebrew-status-public">
      Public, Approved
    </div>
  </div>
`;

const SUBTYPES = [
  { id: 1, name: "Armor Class", type: 1 },
  { id: 2, name: "Strength Score", type: 1 },
  { id: 3, name: "Dexterity Score", type: 1 },
  { id: 54, name: "Necrotic", type: 2 },
  { id: 171, name: "Darkvision", type: 8 },
];

function modifierFormHtml(options: {
  action: string;
  itemId?: number;
  typeId?: number;
  subtypeId?: number;
  fixedValue?: string;
  restriction?: string;
  durationInterval?: string;
  attuned?: boolean;
  extraScript?: string;
}): string {
  const typeOptions = [
    { id: 1, name: "Bonus" },
    { id: 2, name: "Damage" },
    { id: 8, name: "Sense" },
  ];
  return `
    <a href="/homebrew/creations/magic-items/${options.itemId ?? 100}-test-item/edit">Edit item</a>
    <form class="ddb-homebrew-create-form" method="post" action="${options.action}">
      <input name="security-token" type="hidden" value="security">
      <input name="authenticity-token" type="hidden" value="authenticity">
      <select name="spell-modifier-type">
        <option value="">—</option>
        ${typeOptions
          .map(
            (type) =>
              `<option value="${type.id}"${
                options.typeId === type.id ? ' selected="selected"' : ""
              }>${type.name}</option>`,
          )
          .join("")}
      </select>
      <select name="spell-modifier-sub-type">
        <option value="">—</option>
      </select>
      <select name="rpg-stat">
        <option value="">—</option>
        <option value="1">STR</option>
        <option value="3"${
          options.typeId === 1 && options.subtypeId === 2
            ? ' selected="selected"'
            : ""
        }>CON</option>
      </select>
      <input name="dice-count" value="">
      <select name="dice-value">
        <option value="">—</option>
        <option value="6">d6</option>
      </select>
      <input name="fixed-value" value="${options.fixedValue ?? ""}">
      <select name="additional-bonus-type" multiple="multiple">
        <option value="1">Proficiency Bonus</option>
        <option value="2">Attuned Item Count</option>
        <option value="3">Spell Level</option>
      </select>
      <input name="restriction" value="${options.restriction ?? ""}">
      <input name="duration-interval" value="${options.durationInterval ?? ""}">
      <select name="duration-unit">
        <option value="">—</option>
        <option value="2">Minute</option>
      </select>
      <input name="requires-attunement" type="checkbox" value="y"${
        options.attuned ? ' checked="checked"' : ""
      }>
    </form>
    <script>
      var subTypes = [${JSON.stringify(SUBTYPES)}];
    </script>
    <script>
      ${options.extraScript ?? ""}
    </script>
  `;
}

const EDITOR_HTML = `
  <div class="ddb-homebrew-create-special ddb-homebrew-create-special-modifiers">
    <table class="listing listing-rpgentity-modifier rpgentity-modifier-listing">
      <tbody>
        <tr>
          <td>Bonus - Armor Class</td>
          <td></td>
          <td></td>
          <td>3</td>
          <td>Too Pretty to Hit</td>
          <td></td>
          <td>
            <a href="/modifier/999/0/edit">Edit</a> |
            <a href="/modifier/999/delete">Delete</a>
          </td>
        </tr>
        <tr>
          <td>Set - Strength Score</td>
          <td>2d6</td>
          <td>STR</td>
          <td>19</td>
          <td></td>
          <td>1 Minute</td>
          <td>
            <a href="/modifier/1000/0/edit">Edit</a> |
            <a href="/modifier/1000/delete">Delete</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
`;

function createWww(htmlFor: (url: string) => string) {
  const request = vi.fn();
  const getHtml = vi.fn(async (url: string) => ({ html: htmlFor(url) }));
  const getRequestVerificationToken = vi.fn().mockResolvedValue("verification-token");
  const www = {
    getHtml,
    request,
    getRequestVerificationToken,
  } as unknown as WriteWwwClient;

  return { www, request, getHtml, getRequestVerificationToken };
}

function createClient(): HomebrewWriteClient & {
  invalidateCache: ReturnType<typeof vi.fn>;
  invalidateCachePrefix: ReturnType<typeof vi.fn>;
} {
  return {
    invalidateCache: vi.fn(),
    invalidateCachePrefix: vi.fn(),
  } as unknown as HomebrewWriteClient & {
    invalidateCache: ReturnType<typeof vi.fn>;
    invalidateCachePrefix: ReturnType<typeof vi.fn>;
  };
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function postedFields(call: [string, { body?: BodyInit | null }]): URLSearchParams {
  return new URLSearchParams(String(call[1].body));
}

beforeEach(() => {
  clearModifierOptionsCache();
  vi.clearAllMocks();
});

describe("modifier parsing", () => {
  it("parses modifier types and the embedded subtype table", () => {
    const options = parseModifierOptions(
      modifierFormHtml({ action: "/modifier/create/100-112130694/0" }),
    );

    expect(options.types).toEqual([
      { id: 1, name: "Bonus" },
      { id: 2, name: "Damage" },
      { id: 8, name: "Sense" },
    ]);
    expect(options.subtypes).toEqual(SUBTYPES);
  });

  it("parses modifier rows and IDs from the item editor page", () => {
    expect(parseEditorModifiers(EDITOR_HTML)).toEqual([
      {
        id: 999,
        name: "Bonus - Armor Class",
        diceRoll: undefined,
        primaryStat: undefined,
        fixedValue: "3",
        restriction: "Too Pretty to Hit",
        duration: undefined,
      },
      {
        id: 1000,
        name: "Set - Strength Score",
        diceRoll: "2d6",
        primaryStat: "STR",
        fixedValue: "19",
        restriction: undefined,
        duration: "1 Minute",
      },
    ]);
  });
});

describe("modifier value resolution", () => {
  const options = parseModifierOptions(
    modifierFormHtml({ action: "/modifier/create/100-112130694/0" }),
  );

  it("accepts numeric IDs and names case-insensitively", () => {
    expect(resolveModifierType(1, options)).toEqual({ id: 1, name: "Bonus" });
    expect(resolveModifierType("bonus", options)).toEqual({
      id: 1,
      name: "Bonus",
    });
    expect(resolveModifierType("Damage", options)).toEqual({
      id: 2,
      name: "Damage",
    });

    const bonus = resolveModifierType("Bonus", options);
    expect(resolveModifierSubtype("armor class", bonus, options)).toEqual({
      id: 1,
      name: "Armor Class",
      type: 1,
    });
    expect(resolveModifierSubtype(54, resolveModifierType("Damage", options), options)).toEqual({
      id: 54,
      name: "Necrotic",
      type: 2,
    });
  });

  it("rejects unknown names with actionable errors", () => {
    expect(() => resolveModifierType("nope", options)).toThrow(
      /Unknown modifier type "nope".*Bonus \(1\)/,
    );
    expect(() =>
      resolveModifierSubtype("fire", resolveModifierType("Damage", options), options),
    ).toThrow(/Unknown modifier subtype "fire".*Necrotic \(54\)/);
    expect(() =>
      resolveModifierSubtype("Armor Class", resolveModifierType("Damage", options), options),
    ).toThrow(/Unknown modifier subtype "Armor Class"/);
  });

  it("resolves ability scores and die types", () => {
    expect([1, 2, 3, 4, 5, 6].map((id) => resolveAbilityScore(id))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(resolveAbilityScore("str")).toBe(1);
    expect(resolveAbilityScore("Constitution")).toBe(3);
    expect(resolveAbilityScore("cha")).toBe(6);
    expect(() => resolveAbilityScore("luck")).toThrow(/Use 1-6 or one of/);

    expect([4, 6, 8, 10, 12, 20].map((sides) => resolveDieType(sides))).toEqual([
      4, 6, 8, 10, 12, 20,
    ]);
    expect(resolveDieType("d12")).toBe(12);
    expect(() => resolveDieType("d100")).toThrow(/Unknown die type/);
  });
});

describe("listHomebrewMagicItemModifiers", () => {
  it("lists modifier IDs and values from the editor page", async () => {
    const { www } = createWww(() => EDITOR_HTML);

    const result = await listHomebrewMagicItemModifiers(www, { itemId: 100 });
    const text = result.content[0].text;

    expect(text).toContain("Modifiers for homebrew magic item 100 (2)");
    expect(text).toContain(
      "**Bonus - Armor Class** — ID 999 · fixed value 3 · details: Too Pretty to Hit",
    );
    expect(text).toContain(
      "**Set - Strength Score** — ID 1000 · dice 2d6 · primary stat STR · fixed value 19 · duration: 1 Minute",
    );
  });

  it("returns a useful message when there are no modifiers", async () => {
    const { www } = createWww(() => "<html></html>");

    const result = await listHomebrewMagicItemModifiers(www, { itemId: 100 });

    expect(result.content[0].text).toContain("has no modifiers");
    expect(result.content[0].text).toContain("add_homebrew_magic_item_modifier");
  });
});

describe("homebrew write guards", () => {
  it("matches the published guard by ID and magic item entity type", async () => {
    const mixedTypeHtml = `
      <div class="list-row list-row-homebrew-creation" data-type="feats"
           data-slug="200-published-feat">
        <div class="list-row-name-primary-text">
          <a href="/homebrew/creations/view?entityTypeId=1088085227&amp;id=200">Published Feat</a>
        </div>
        <div class="list-row-name-secondary-text homebrew-status homebrew-status-public">
          Public, Approved
        </div>
      </div>
      <div class="list-row list-row-homebrew-creation" data-type="magic-items"
           data-slug="200-private-item">
        <div class="list-row-name-primary-text">
          <a href="/homebrew/creations/view?entityTypeId=112130694&amp;id=200">Private Item</a>
        </div>
        <div class="list-row-name-secondary-text homebrew-status homebrew-status-private">
          Private, Never Submitted
        </div>
      </div>
    `;

    const { www } = createWww(() => mixedTypeHtml);
    const item = await assertHomebrewItemWritable(www, 200);

    expect(item.entityTypeId).toBe(112130694);
    expect(item.name).toBe("Private Item");
    expect(item.status).toBe("private");
  });

  it("refuses writes to published items without sending anything", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);
    const client = createClient();

    const result = await addHomebrewMagicItemModifier(
      client,
      { itemId: 200, type: "Bonus", subtype: "Armor Class" },
      www,
    );

    expect(result.content[0].text).toContain("is published");
    expect(result.content[0].text).toContain("no changes were sent");
    expect(request).not.toHaveBeenCalled();
    expect(client.invalidateCache).not.toHaveBeenCalled();
  });

  it("refuses writes to an unknown item", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);

    const result = await addHomebrewMagicItemModifier(
      createClient(),
      { itemId: 999, type: "Bonus", subtype: "Armor Class" },
      www,
    );

    expect(result.content[0].text).toContain("was not found");
    expect(request).not.toHaveBeenCalled();
  });

  it("invalidates character and homebrew caches after a write", () => {
    const client = createClient();

    invalidateCharacterCaches(client);
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");

    invalidateHomebrewWriteCaches(client);
    expect(client.invalidateCache).toHaveBeenCalledWith("homebrew:items");
    expect(client.invalidateCachePrefix).toHaveBeenCalledTimes(2);
  });
});

describe("addHomebrewMagicItemModifier", () => {
  it("resolves names, posts the form once, and invalidates caches", async () => {
    const { www, request } = createWww((url) =>
      url.includes("/my-creations")
        ? MY_CREATIONS_HTML
        : modifierFormHtml({ action: "/modifier/create/100-112130694/0" }),
    );
    request.mockResolvedValue(
      redirectResponse("/homebrew/creations/magic-items/100-test-item/edit#modifiers"),
    );
    const client = createClient();

    const result = await addHomebrewMagicItemModifier(
      client,
      {
        itemId: 100,
        type: "Bonus",
        subtype: "Armor Class",
        fixedValue: 1,
        details: "Too Pretty to Hit",
        requiresAttunement: true,
      },
      www,
    );

    expect(result.content[0].text).toContain("Added modifier Bonus - Armor Class");
    expect(request).toHaveBeenCalledTimes(1);

    const call = request.mock.calls[0] as [string, { body?: BodyInit | null; followRedirects?: boolean }];
    expect(call[0]).toBe("/modifier/create/100-112130694/0");
    expect(call[1].followRedirects).toBe(false);
    const fields = new URLSearchParams(String(call[1].body));
    expect(fields.get("spell-modifier-type")).toBe("1");
    expect(fields.get("spell-modifier-sub-type")).toBe("1");
    expect(fields.get("fixed-value")).toBe("1");
    expect(fields.get("restriction")).toBe("Too Pretty to Hit");
    expect(fields.get("requires-attunement")).toBe("y");
    expect(fields.get("additional-bonus-type")).toBeNull();
    expect(fields.get("security-token")).toBe("security");
    expect(fields.get("authenticity-token")).toBe("authenticity");

    expect(client.invalidateCache).toHaveBeenCalledWith("homebrew:items");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("does not retry a failed form POST", async () => {
    const { www, request } = createWww((url) =>
      url.includes("/my-creations")
        ? MY_CREATIONS_HTML
        : modifierFormHtml({ action: "/modifier/create/100-112130694/0" }),
    );
    request.mockResolvedValue(
      new Response(
        '<div class="validation-summary-errors"><li>Subtype is required.</li></div>',
        { status: 200 },
      ),
    );

    const result = await addHomebrewMagicItemModifier(
      createClient(),
      { itemId: 100, type: "Bonus", subtype: "Armor Class" },
      www,
    );

    expect(result.content[0].text).toContain("Adding the modifier failed");
    expect(result.content[0].text).toContain("Subtype is required.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown subtype before posting", async () => {
    const { www, request } = createWww((url) =>
      url.includes("/my-creations")
        ? MY_CREATIONS_HTML
        : modifierFormHtml({ action: "/modifier/create/100-112130694/0" }),
    );

    const result = await addHomebrewMagicItemModifier(
      createClient(),
      { itemId: 100, type: "Bonus", subtype: "Fire" },
      www,
    );

    expect(result.content[0].text).toContain('Unknown modifier subtype "Fire"');
    expect(request).not.toHaveBeenCalled();
  });
});

describe("editHomebrewMagicItemModifier", () => {
  it("preserves fields that were not passed and sets the current subtype", async () => {
    const editHtml = modifierFormHtml({
      action: "/modifier/999/0/edit",
      typeId: 1,
      subtypeId: 1,
      fixedValue: "3",
      restriction: "Old details",
      durationInterval: "5",
      extraScript: "var subTypesValue = 1;",
    });
    const { www, request } = createWww((url) =>
      url.includes("/my-creations")
        ? MY_CREATIONS_HTML
        : editHtml,
    );
    request.mockResolvedValue(redirectResponse("/homebrew/creations/.../edit#modifiers"));
    const client = createClient();

    const result = await editHomebrewMagicItemModifier(
      client,
      { itemId: 100, modifierId: 999, fixedValue: 2, details: "New details" },
      www,
    );

    expect(result.content[0].text).toContain("Updated modifier 999");
    const call = request.mock.calls[0] as [string, { body?: BodyInit | null }];
    expect(call[0]).toBe("/modifier/999/0/edit");
    const fields = postedFields(call);
    expect(fields.get("spell-modifier-type")).toBe("1");
    expect(fields.get("spell-modifier-sub-type")).toBe("1");
    expect(fields.get("fixed-value")).toBe("2");
    expect(fields.get("restriction")).toBe("New details");
    expect(fields.get("duration-interval")).toBe("5");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("changes type and requires a subtype valid for the new type", async () => {
    const editHtml = modifierFormHtml({
      action: "/modifier/999/0/edit",
      typeId: 1,
      fixedValue: "3",
      extraScript: "var subTypesValue = 1;",
    });
    const { www, request } = createWww((url) =>
      url.includes("/my-creations") ? MY_CREATIONS_HTML : editHtml,
    );

    const result = await editHomebrewMagicItemModifier(
      createClient(),
      { itemId: 100, modifierId: 999, type: "Damage" },
      www,
    );

    expect(result.content[0].text).toContain(
      "Unknown modifier subtype ID 1 for Damage (2)",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a modifier that belongs to a different item", async () => {
    const editHtml = modifierFormHtml({
      action: "/modifier/999/0/edit",
      itemId: 200,
      typeId: 1,
      extraScript: "var subTypesValue = 1;",
    });
    const { www, request } = createWww((url) =>
      url.includes("/my-creations") ? MY_CREATIONS_HTML : editHtml,
    );

    const result = await editHomebrewMagicItemModifier(
      createClient(),
      { itemId: 100, modifierId: 999, fixedValue: 2 },
      www,
    );

    expect(result.content[0].text).toContain("belongs to homebrew magic item 200");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("removeHomebrewMagicItemModifier", () => {
  it("verifies the modifier belongs to the item and posts the AJAX token", async () => {
    const { www, request } = createWww((url) =>
      url.includes("/my-creations") ? MY_CREATIONS_HTML : EDITOR_HTML,
    );
    request.mockResolvedValue(new Response(null, { status: 200 }));
    const client = createClient();

    const result = await removeHomebrewMagicItemModifier(
      client,
      { itemId: 100, modifierId: 999 },
      www,
    );

    expect(result.content[0].text).toContain(
      "Removed modifier 999 (Bonus - Armor Class)",
    );
    expect(result.content[0].text).toContain("cannot be undone");
    const call = request.mock.calls[0] as [string, { body?: BodyInit | null }];
    expect(call[0]).toBe("https://www.dndbeyond.com/modifier/999/delete");
    expect(new URLSearchParams(String(call[1].body)).get("request-verification-token")).toBe(
      "verification-token",
    );
    expect(client.invalidateCache).toHaveBeenCalledWith("homebrew:items");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("refuses to delete a modifier that is not on the item", async () => {
    const { www, request } = createWww((url) =>
      url.includes("/my-creations") ? MY_CREATIONS_HTML : EDITOR_HTML,
    );

    const result = await removeHomebrewMagicItemModifier(
      createClient(),
      { itemId: 100, modifierId: 42 },
      www,
    );

    expect(result.content[0].text).toContain("was not found on homebrew magic item 100");
    expect(request).not.toHaveBeenCalled();
  });
});
