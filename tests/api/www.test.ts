import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CookieJar,
  WwwClient,
  extractFormFields,
  extractFormTokens,
} from "../../src/api/www.js";
import * as auth from "../../src/api/auth.js";
import { HttpError } from "../../src/resilience/index.js";
import type { RateLimiter } from "../../src/resilience/index.js";

vi.mock("../../src/api/auth.js", () => ({
  getAllCookies: vi.fn(),
}));

describe("CookieJar", () => {
  it("serializes, updates, and deletes cookies", () => {
    const jar = new CookieJar([
      { name: "CobaltSession", value: "session" },
      { name: "Geo", value: "US" },
    ]);

    expect(jar.toHeader()).toBe("CobaltSession=session; Geo=US");

    jar.applySetCookieHeaders(["Geo=UK; Path=/; HttpOnly"]);
    expect(jar.get("Geo")).toBe("UK");

    jar.applySetCookieHeaders(["Geo=; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
    expect(jar.has("Geo")).toBe(false);
    expect(jar.size).toBe(1);
  });

  it("ignores malformed Set-Cookie headers", () => {
    const jar = new CookieJar();
    jar.applySetCookieHeaders(["not-a-cookie", "=missing-name"]);

    expect(jar.size).toBe(0);
  });
});

describe("form parsing", () => {
  const html = `
    <form id="item-form">
      <input name="security-token" type="hidden" value="abc123">
      <input name="authenticity-token" type="hidden" value="jwe-token">
      <input name="name" type="text" value="Dazzling Cloak &amp; Co">
      <input name="requires-attunement" type="checkbox" value="y" checked>
      <input name="ignored-checkbox" type="checkbox" value="y">
      <input name="field-abc" type="file">
      <input name="disabled-field" type="text" value="nope" disabled>
      <textarea name="notes">Line one &amp; two</textarea>
      <select name="rarity">
        <option value="1">Common</option>
        <option value="2" selected>Uncommon</option>
      </select>
      <select name="empty-single">
        <option value="">—</option>
        <option value="1">One</option>
      </select>
      <select name="empty-multiple" multiple>
        <option value="1">One</option>
        <option value="2">Two</option>
      </select>
      <select name="selected-multiple" multiple>
        <option value="1" selected>One</option>
        <option value="2" selected>Two</option>
        <option value="3">Three</option>
      </select>
      <input name="magic-item-tags-public" type="checkbox" value="27" checked>
      <input name="magic-item-tags-public" type="checkbox" value="28" checked>
    </form>
    <form id="other"><input name="name" value="other form"></form>
  `;

  it("extracts fields, repeated values, and anti-forgery tokens", () => {
    const fields = extractFormFields(html, "#item-form");

    expect(fields["security-token"]).toEqual(["abc123"]);
    expect(fields["authenticity-token"]).toEqual(["jwe-token"]);
    expect(fields.name).toEqual(["Dazzling Cloak & Co"]);
    expect(fields["requires-attunement"]).toEqual(["y"]);
    expect(fields["ignored-checkbox"]).toBeUndefined();
    expect(fields["field-abc"]).toBeUndefined();
    expect(fields["disabled-field"]).toBeUndefined();
    expect(fields.notes).toEqual(["Line one & two"]);
    expect(fields.rarity).toEqual(["2"]);
    expect(fields["empty-single"]).toEqual([""]);
    expect(fields["empty-multiple"]).toBeUndefined();
    expect(fields["selected-multiple"]).toEqual(["1", "2"]);
    expect(fields["magic-item-tags-public"]).toEqual(["27", "28"]);

    expect(extractFormTokens(html, "#item-form")).toEqual({
      securityToken: "abc123",
      authenticityToken: "jwe-token",
    });
  });

  it("throws when anti-forgery tokens are missing", () => {
    expect(() => extractFormTokens("<form><input name='name' value='x'></form>")).toThrow(
      /security-token and authenticity-token/,
    );
  });
});

describe("WwwClient", () => {
  beforeEach(() => {
    vi.mocked(auth.getAllCookies).mockReset();
  });

  function createClient(fetchImpl: ReturnType<typeof vi.fn>) {
    return new WwwClient({
      loadSavedCookies: false,
      cookies: [{ name: "CobaltSession", value: "session" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  it("follows redirects, carries cookies, and keeps Set-Cookie values", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "/homebrew/creations/edit?entityTypeId=112130694&id=1",
            "set-cookie": "Geo=US; Path=/",
          },
        }),
      )
      .mockResolvedValueOnce(new Response("<html>editor</html>", { status: 200 }));

    const client = createClient(fetchImpl);
    const result = await client.getHtml("/start");

    expect(result.status).toBe(200);
    expect(result.html).toBe("<html>editor</html>");
    expect(result.url).toBe(
      "https://www.dndbeyond.com/homebrew/creations/edit?entityTypeId=112130694&id=1",
    );
    expect(client.cookies.get("Geo")).toBe("US");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0];
    const [secondUrl, secondInit] = fetchImpl.mock.calls[1];
    expect(firstUrl).toBe("https://www.dndbeyond.com/start");
    expect(secondUrl).toContain("/homebrew/creations/edit");
    expect(firstInit.headers.Cookie).toBe("CobaltSession=session");
    expect(secondInit.headers.Cookie).toBe("CobaltSession=session; Geo=US");
  });

  it("rejects cross-origin redirects without fetching the other origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/collect" },
      }),
    );

    const client = createClient(fetchImpl);

    await expect(client.getHtml("/start")).rejects.toThrow(/untrusted URL/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://www.dndbeyond.com/start");
    expect(
      fetchImpl.mock.calls.some(([url]) => String(url).includes("evil.example")),
    ).toBe(false);
  });

  it("rejects HTTPS-to-HTTP redirect downgrades", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://www.dndbeyond.com/start" },
      }),
    );

    const client = createClient(fetchImpl);

    await expect(client.getHtml("/start")).rejects.toThrow(/untrusted URL/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://www.dndbeyond.com/start");
  });

  it("rejects an initial non-HTTPS or cross-origin URL before sending cookies", async () => {
    const fetchImpl = vi.fn();
    const client = createClient(fetchImpl);

    await expect(client.getHtml("http://www.dndbeyond.com/start")).rejects.toThrow(
      /untrusted URL/,
    );
    await expect(client.getHtml("https://evil.example/start")).rejects.toThrow(
      /untrusted URL/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries loading saved credentials after an initial unauthenticated request", async () => {
    const getAllCookies = vi.mocked(auth.getAllCookies);
    getAllCookies.mockResolvedValueOnce([]);

    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>ok</html>", { status: 200 }));
    const client = new WwwClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getHtml("/start")).rejects.toThrow("Not authenticated");
    expect(fetchImpl).not.toHaveBeenCalled();

    // setup_auth saves credentials while the process is still running.
    getAllCookies.mockResolvedValue([{ name: "CobaltSession", value: "fresh" }]);

    await expect(client.getHtml("/start")).resolves.toMatchObject({
      status: 200,
    });
    expect(getAllCookies).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBe(
      "CobaltSession=fresh",
    );
  });

  it("reset() drops cached cookies and reloads saved credentials", async () => {
    const getAllCookies = vi.mocked(auth.getAllCookies);
    getAllCookies.mockResolvedValue([
      { name: "CobaltSession", value: "old-session" },
    ]);

    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("<html>ok</html>", { status: 200 })),
      );
    const client = new WwwClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getHtml("/start");
    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBe(
      "CobaltSession=old-session",
    );

    getAllCookies.mockResolvedValue([
      { name: "CobaltSession", value: "new-session" },
    ]);
    client.reset();
    await client.getHtml("/start");

    expect(getAllCookies).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Cookie).toBe(
      "CobaltSession=new-session",
    );
  });

  it("acquires the shared rate limiter before every request", async () => {
    const acquire = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/next" },
        }),
      )
      .mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200 }));

    const client = new WwwClient({
      loadSavedCookies: false,
      cookies: [{ name: "CobaltSession", value: "session" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: { acquire } as unknown as RateLimiter,
    });

    await client.getHtml("/start");

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.invocationCallOrder[0]).toBeLessThan(
      fetchImpl.mock.invocationCallOrder[0],
    );
  });

  it("throws HttpError for non-ok HTML responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("forbidden", { status: 403 }));

    const client = createClient(fetchImpl);

    await expect(client.getHtml("/blocked")).rejects.toBeInstanceOf(HttpError);
  });

  it("uses an existing RequestVerificationToken cookie", async () => {
    const fetchImpl = vi.fn();
    const client = new WwwClient({
      loadSavedCookies: false,
      cookies: [{ name: "RequestVerificationToken", value: "existing" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getRequestVerificationToken()).resolves.toBe("existing");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes a missing RequestVerificationToken cookie", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "success" }), {
        status: 200,
        headers: { "set-cookie": "RequestVerificationToken=fresh; Path=/" },
      }),
    );

    const client = createClient(fetchImpl);

    await expect(client.getRequestVerificationToken()).resolves.toBe("fresh");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.dndbeyond.com/refresh-request-verification-token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(client.cookies.get("RequestVerificationToken")).toBe("fresh");
  });
});
