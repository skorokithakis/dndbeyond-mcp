import { describe, it, expect, vi } from "vitest";
import {
  createHomebrewMagicItem,
  deleteHomebrewMagicItem,
  normalizeItemDescription,
  parseItemIdFromLocation,
  parseSelectOptions,
  updateHomebrewMagicItem,
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

function tokens(): string {
  return `
    <input name="security-token" type="hidden" value="security">
    <input name="authenticity-token" type="hidden" value="authenticity">
  `;
}

function rarityOptions(selected = ""): string {
  return `
    <option value="">—</option>
    <option value="1"${selected === "1" ? ' selected="selected"' : ""}>Common</option>
    <option value="2"${selected === "2" ? ' selected="selected"' : ""}>Uncommon</option>
    <option value="3"${selected === "3" ? ' selected="selected"' : ""}>Rare</option>
    <option value="4"${selected === "4" ? ' selected="selected"' : ""}>Very Rare</option>
    <option value="5"${selected === "5" ? ' selected="selected"' : ""}>Legendary</option>
    <option value="7"${selected === "7" ? ' selected="selected"' : ""}>Artifact</option>
  `;
}

function typeOptions(selected = ""): string {
  return `
    <option value="">—</option>
    <option value="10"${selected === "10" ? ' selected="selected"' : ""}>Wondrous Item</option>
    <option value="4"${selected === "4" ? ' selected="selected"' : ""}>Ring</option>
    <option value="3"${selected === "3" ? ' selected="selected"' : ""}>Potion</option>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface ItemFormOptions {
  action?: string;
  name?: string;
  description?: string;
  rarity?: string;
  type?: string;
  weight?: string | null;
  notes?: string | null;
  attuned?: boolean;
}

function itemFormHtml(options: ItemFormOptions = {}): string {
  const weight =
    options.weight === null
      ? ""
      : `<input name="weight" value="${options.weight ?? ""}">`;
  const notes =
    options.notes === null
      ? ""
      : `<textarea name="notes">${options.notes ?? ""}</textarea>`;

  return `
    <form class="ddb-homebrew-create-form" method="post"
          action="${options.action ?? "/homebrew/creations/create-magic-item/create"}"
          enctype="multipart/form-data">
      ${tokens()}
      <input name="name" value="${options.name ?? ""}">
      <input name="version" value="">
      <input name="strength-requirement" value="">
      <input name="requires-attunement" type="checkbox" value="y"${
        options.attuned ? ' checked="checked"' : ""
      }>
      <input name="attunement-description" value="">
      <input name="item-description-type" type="hidden" value="1">
      <textarea name="item-description-wysiwyg">${escapeHtml(options.description ?? "")}</textarea>
      <textarea name="item-description">${escapeHtml(options.description ?? "")}</textarea>
      ${weight}
      ${notes}
      <select name="rarity">${rarityOptions(options.rarity)}</select>
      <select name="type">${typeOptions(options.type)}</select>
    </form>
  `;
}

const TEMPLATE_HTML = `
  <form action="/homebrew/creations/create-magic-item" method="post">
    ${tokens()}
    <select name="magic-item-type">
      <option value="" selected="selected">All</option>
      <option value="1">Armor</option>
      <option value="10"> Wondrous Item</option>
    </select>
    <select name="magic-item">
      <option value="" selected="selected">—</option>
      <option value="4568">Amulet of Health</option>
      <option value="4850">Adamantine Chain Mail</option>
    </select>
  </form>
`;

function createWww(htmlFor: (url: string) => string) {
  const request = vi.fn();
  const getHtml = vi.fn(async (url: string) => ({ html: htmlFor(url), url }));
  const getRequestVerificationToken = vi
    .fn()
    .mockResolvedValue("verification-token");
  const www = {
    getHtml,
    request,
    getRequestVerificationToken,
  } as unknown as WriteWwwClient;

  return { www, request, getHtml, getRequestVerificationToken };
}

function createClient() {
  return {
    invalidateCache: vi.fn(),
    invalidateCachePrefix: vi.fn(),
  } as unknown as HomebrewWriteClient & {
    invalidateCache: ReturnType<typeof vi.fn>;
    invalidateCachePrefix: ReturnType<typeof vi.fn>;
  };
}

function redirectResponse(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}

function formData(call: [string, { body?: BodyInit | null }]): FormData {
  return call[1].body as FormData;
}

describe("item form parsing", () => {
  it("reads select options from the form so IDs are not hard-coded", () => {
    const options = parseSelectOptions(itemFormHtml(), "rarity");
    expect(options).toContainEqual({ value: "3", name: "Rare", selected: false });
    expect(options.find((option) => option.name === "Very Rare")?.value).toBe("4");
  });

  it("parses item IDs from both create redirect shapes", () => {
    expect(
      parseItemIdFromLocation(
        "/homebrew/creations/magic-items/123-zz-mcp-test-item/edit",
      ),
    ).toBe(123);
    expect(
      parseItemIdFromLocation(
        "/homebrew/creations/edit?entityTypeId=112130694&id=456",
      ),
    ).toBe(456);
    expect(parseItemIdFromLocation("/homebrew/creations/magic-items/foo/edit")).toBeUndefined();
  });

  it("wraps plain text but leaves HTML descriptions alone", () => {
    expect(normalizeItemDescription("Line one\n\nLine two & more")).toBe(
      "<p>Line one</p><p>Line two &amp; more</p>",
    );
    expect(normalizeItemDescription("<p>Already <b>HTML</b></p>")).toBe(
      "<p>Already <b>HTML</b></p>",
    );
    expect(normalizeItemDescription("  ")).toBe("");
  });
});

describe("createHomebrewMagicItem", () => {
  it("creates from scratch with a multipart form and invalidates caches", async () => {
    const { www, request } = createWww(() => itemFormHtml());
    request.mockResolvedValue(
      redirectResponse("/homebrew/creations/magic-items/123-zz-mcp-test-item/edit"),
    );
    const client = createClient();

    const result = await createHomebrewMagicItem(
      client,
      {
        name: "ZZ MCP Test Item",
        description: "A test item.",
        rarity: "Rare",
        type: "Wondrous Item",
        requiresAttunement: true,
        attunementDescription: "by a wizard",
        version: "1.0",
      },
      www,
    );

    expect(result.content[0].text).toContain('Created homebrew magic item 123 ("ZZ MCP Test Item")');
    expect(request).toHaveBeenCalledTimes(1);

    const call = request.mock.calls[0] as [string, { body?: BodyInit | null; followRedirects?: boolean }];
    expect(call[0]).toBe("/homebrew/creations/create-magic-item/create");
    expect(call[1].followRedirects).toBe(false);
    const body = formData(call);
    expect(body.get("name")).toBe("ZZ MCP Test Item");
    expect(body.get("rarity")).toBe("3");
    expect(body.get("type")).toBe("10");
    expect(body.get("requires-attunement")).toBe("y");
    expect(body.get("attunement-description")).toBe("by a wizard");
    expect(body.get("security-token")).toBe("security");
    expect(body.get("authenticity-token")).toBe("authenticity");
    expect(body.get("item-description-wysiwyg")).toBe("<p>A test item.</p>");
    expect(body.get("item-description")).toBe("<p>A test item.</p>");
    expect(client.invalidateCache).toHaveBeenCalledWith("homebrew:items");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("requires a name when creating from scratch", async () => {
    const { www, request } = createWww(() => itemFormHtml());

    const result = await createHomebrewMagicItem(createClient(), {}, www);

    expect(result.content[0].text).toContain("non-empty name is required");
    expect(request).not.toHaveBeenCalled();
  });

  it("requires a description when creating from scratch", async () => {
    const { www, request } = createWww(() => itemFormHtml());

    const result = await createHomebrewMagicItem(
      createClient(),
      { name: "ZZ MCP Test Item" },
      www,
    );

    expect(result.content[0].text).toContain("description is required");
    expect(result.content[0].text).toContain("No item was created");
    expect(request).not.toHaveBeenCalled();
  });

  it("applies weight and notes with a follow-up save because the create page lacks them", async () => {
    const { www, request } = createWww((url) => {
      if (url.includes("my-creations")) return MY_CREATIONS_HTML;
      if (url.includes("create-magic-item")) {
        return itemFormHtml({ weight: null, notes: null });
      }
      return itemFormHtml({
        action: "/homebrew/creations/magic-items/100-test-item/edit",
        name: "ZZ MCP Test Item",
        weight: "",
        notes: "",
      });
    });
    request
      .mockResolvedValueOnce(
        redirectResponse("/homebrew/creations/magic-items/100-test-item/edit"),
      )
      .mockResolvedValueOnce(
        redirectResponse("/homebrew/creations/magic-items/100-test-item/edit"),
      );

    const result = await createHomebrewMagicItem(
      createClient(),
      {
        name: "ZZ MCP Test Item",
        description: "A test item.",
        weight: 2,
        notes: "test notes",
      },
      www,
    );

    expect(result.content[0].text).toContain("follow-up save");
    expect(request).toHaveBeenCalledTimes(2);
    const deferred = formData(request.mock.calls[1] as [string, { body?: BodyInit | null }]);
    expect(deferred.get("weight")).toBe("2");
    expect(deferred.get("notes")).toBe("test notes");
    expect(deferred.get("name")).toBe("ZZ MCP Test Item");
  });

  it("does not retry a failed create POST", async () => {
    const { www, request } = createWww(() => itemFormHtml());
    request.mockResolvedValue(
      new Response(
        '<div class="validation-summary-errors"><li>Name is required.</li></div>',
        { status: 200 },
      ),
    );

    const result = await createHomebrewMagicItem(
      createClient(),
      { name: "ZZ MCP Test Item", description: "A test item." },
      www,
    );

    expect(result.content[0].text).toContain("Creating the item failed");
    expect(result.content[0].text).toContain("Name is required.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("surfaces D&D Beyond field-errors messages when a create is rejected", async () => {
    const { www, request } = createWww(() => itemFormHtml());
    request.mockResolvedValue(
      new Response(
        '<span class="field-errors">This field is required.</span>',
        { status: 200 },
      ),
    );

    const result = await createHomebrewMagicItem(
      createClient(),
      { name: "ZZ MCP Test Item", description: "A test item." },
      www,
    );

    expect(result.content[0].text).toContain("Creating the item failed");
    expect(result.content[0].text).toContain("This field is required.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("explains a silent create failure and mentions the description requirement", async () => {
    const { www, request } = createWww(() => itemFormHtml());
    request.mockResolvedValue(new Response("<html></html>", { status: 200 }));

    const result = await createHomebrewMagicItem(
      createClient(),
      { name: "ZZ MCP Test Item", description: "A test item." },
      www,
    );

    expect(result.content[0].text).toContain("Creating the item failed");
    expect(result.content[0].text).toContain("no validation message");
    expect(result.content[0].text).toContain("description is required");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("creates from a template by name, then applies the requested name", async () => {
    const { www, request } = createWww((url) => {
      if (url.includes("create-magic-item")) return TEMPLATE_HTML;
      if (url.includes("my-creations")) return MY_CREATIONS_HTML;
      if (url.includes("edit?")) {
        return itemFormHtml({
          action: "/homebrew/creations/magic-items/100-test-item/edit",
          name: "COPY_OF_Amulet of Health",
          description: "Template text",
          rarity: "2",
          type: "10",
        });
      }
      return "";
    });
    request
      .mockResolvedValueOnce(
        redirectResponse("/homebrew/creations/edit?entityTypeId=112130694&id=100", 302),
      )
      .mockResolvedValueOnce(redirectResponse("/homebrew/creations/magic-items/100-test-item/edit"));
    const client = createClient();

    const result = await createHomebrewMagicItem(
      client,
      { templateItemId: "Amulet of Health", name: "ZZ MCP Test Item" },
      www,
    );

    expect(result.content[0].text).toContain('Created homebrew magic item 100 from template "Amulet of Health"');
    expect(result.content[0].text).toContain("follow-up save");
    expect(request).toHaveBeenCalledTimes(2);

    const templateCall = request.mock.calls[0] as [string, { body?: BodyInit | null }];
    expect(templateCall[0]).toBe("/homebrew/creations/create-magic-item");
    const templateFields = new URLSearchParams(String(templateCall[1].body));
    expect(templateFields.get("magic-item")).toBe("4568");
    expect(templateFields.get("security-token")).toBe("security");

    const editCall = request.mock.calls[1] as [string, { body?: BodyInit | null }];
    expect(formData(editCall).get("name")).toBe("ZZ MCP Test Item");
    expect(formData(editCall).get("item-description-wysiwyg")).toBe("Template text");
  });

  it("rejects an unknown template without posting", async () => {
    const { www, request } = createWww(() => TEMPLATE_HTML);

    const result = await createHomebrewMagicItem(
      createClient(),
      { templateItemId: "Nope", name: "ZZ MCP Test Item" },
      www,
    );

    expect(result.content[0].text).toContain('Template item "Nope" was not found');
    expect(request).not.toHaveBeenCalled();
  });
});

describe("updateHomebrewMagicItem", () => {
  it("loads the edit form and preserves fields the caller did not pass", async () => {
    const editor = itemFormHtml({
      action: "/homebrew/creations/magic-items/100-test-item/edit",
      name: "Old Name",
      description: "Old <b>description</b>",
      rarity: "3",
      type: "4",
      weight: "2",
      notes: "keep these notes",
      attuned: true,
    });
    const { www, request } = createWww((url) =>
      url.includes("my-creations") ? MY_CREATIONS_HTML : editor,
    );
    request.mockResolvedValue(
      redirectResponse("/homebrew/creations/magic-items/100-test-item/edit"),
    );
    const client = createClient();

    const result = await updateHomebrewMagicItem(
      client,
      { itemId: 100, name: "New Name" },
      www,
    );

    expect(result.content[0].text).toContain("Updated homebrew magic item 100");
    expect(result.content[0].text).toContain("preserved");
    expect(request).toHaveBeenCalledTimes(1);

    const call = request.mock.calls[0] as [string, { body?: BodyInit | null }];
    expect(call[0]).toBe("/homebrew/creations/magic-items/100-test-item/edit");
    const body = formData(call);
    expect(body.get("name")).toBe("New Name");
    expect(body.get("item-description-wysiwyg")).toBe("Old <b>description</b>");
    expect(body.get("item-description")).toBe("Old <b>description</b>");
    expect(body.get("rarity")).toBe("3");
    expect(body.get("type")).toBe("4");
    expect(body.get("weight")).toBe("2");
    expect(body.get("notes")).toBe("keep these notes");
    expect(body.get("requires-attunement")).toBe("y");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("sets both description fields and can clear attunement", async () => {
    const editor = itemFormHtml({
      action: "/homebrew/creations/magic-items/100-test-item/edit",
      name: "Old Name",
      description: "Old description",
      attuned: true,
    });
    const { www, request } = createWww((url) =>
      url.includes("my-creations") ? MY_CREATIONS_HTML : editor,
    );
    request.mockResolvedValue(redirectResponse("/homebrew/creations/magic-items/100-test-item/edit"));

    await updateHomebrewMagicItem(
      createClient(),
      {
        itemId: 100,
        description: "<p>New <strong>description</strong></p>",
        requiresAttunement: false,
      },
      www,
    );

    const body = formData(request.mock.calls[0] as [string, { body?: BodyInit | null }]);
    expect(body.get("item-description-wysiwyg")).toBe(
      "<p>New <strong>description</strong></p>",
    );
    expect(body.get("item-description")).toBe(
      "<p>New <strong>description</strong></p>",
    );
    expect(body.get("requires-attunement")).toBeNull();
  });

  it("refuses to update a published item without sending anything", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);

    const result = await updateHomebrewMagicItem(
      createClient(),
      { itemId: 200, name: "New Name" },
      www,
    );

    expect(result.content[0].text).toContain("is published");
    expect(result.content[0].text).toContain("no changes were sent");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an update with no fields", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);

    const result = await updateHomebrewMagicItem(
      createClient(),
      { itemId: 100 },
      www,
    );

    expect(result.content[0].text).toContain("No changes were requested");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("deleteHomebrewMagicItem", () => {
  it("posts the AJAX verification token and invalidates caches", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);
    request.mockResolvedValue(new Response(null, { status: 200 }));
    const client = createClient();

    const result = await deleteHomebrewMagicItem(client, { itemId: 100 }, www);

    expect(result.content[0].text).toContain("Deleted homebrew magic item 100");
    expect(result.content[0].text).toContain("soft delete");
    expect(result.content[0].text).toContain("cannot restore");
    expect(request).toHaveBeenCalledTimes(1);

    const call = request.mock.calls[0] as [string, { body?: BodyInit | null }];
    expect(call[0]).toBe(
      "https://www.dndbeyond.com/homebrew/creations/delete?entityTypeId=112130694&id=100",
    );
    expect(
      new URLSearchParams(String(call[1].body)).get("request-verification-token"),
    ).toBe("verification-token");
    expect(client.invalidateCache).toHaveBeenCalledWith("homebrew:items");
    expect(client.invalidateCachePrefix).toHaveBeenCalledWith("character:");
  });

  it("refuses to delete a published item without sending anything", async () => {
    const { www, request } = createWww(() => MY_CREATIONS_HTML);

    const result = await deleteHomebrewMagicItem(createClient(), { itemId: 200 }, www);

    expect(result.content[0].text).toContain("is published");
    expect(request).not.toHaveBeenCalled();
  });
});
