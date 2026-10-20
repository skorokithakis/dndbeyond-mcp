import { parse } from "node-html-parser";
import { getAllCookies } from "./auth.js";
import { DDB_WATERDEEP, ENDPOINTS } from "./endpoints.js";
import { HttpError, type RateLimiter } from "../resilience/index.js";

export interface WwwCookie {
  name: string;
  value: string;
}

/**
 * In-memory cookie jar for the www.dndbeyond.com server-rendered pages.
 *
 * The saved credentials only contain CobaltSession. The website sets additional
 * cookies (Geo, CobaltSessionHash, RequestVerificationToken, ...) which must be
 * carried across requests, so every www request goes through this jar.
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  constructor(entries: Iterable<WwwCookie> = []) {
    for (const entry of entries) {
      this.set(entry.name, entry.value);
    }
  }

  get size(): number {
    return this.cookies.size;
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  delete(name: string): void {
    this.cookies.delete(name);
  }

  clear(): void {
    this.cookies.clear();
  }

  toEntries(): WwwCookie[] {
    return Array.from(this.cookies, ([name, value]) => ({ name, value }));
  }

  toHeader(): string {
    return this.toEntries()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  /**
   * Applies Set-Cookie header values. Expired/cleared cookies are removed.
   * Header values are never logged: they contain session credentials.
   */
  applySetCookieHeaders(headers: Iterable<string>): void {
    for (const header of headers) {
      const parsed = parseSetCookie(header);
      if (!parsed) continue;
      if (parsed.expired) {
        this.cookies.delete(parsed.name);
      } else {
        this.cookies.set(parsed.name, parsed.value);
      }
    }
  }
}

function parseSetCookie(
  header: string,
): { name: string; value: string; expired: boolean } | null {
  const separator = header.indexOf(";");
  const pair = separator === -1 ? header : header.slice(0, separator);
  const equals = pair.indexOf("=");
  if (equals <= 0) return null;

  const name = pair.slice(0, equals).trim();
  const value = pair.slice(equals + 1).trim();
  if (!name) return null;

  const attributes = separator === -1 ? "" : header.slice(separator).toLowerCase();
  const maxAge = /(?:^|;)\s*max-age=(-?\d+)/.exec(attributes);
  const expires = /(?:^|;)\s*expires=([^;]+)/.exec(attributes);
  const expired =
    value === "" ||
    (maxAge !== null && Number(maxAge[1]) <= 0) ||
    (expires !== null && Date.parse(expires[1]) <= Date.now());

  return { name, value, expired };
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,=\s]+=)/);
}

export interface WwwRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  /** Defaults to true. Write flows may want to inspect the redirect response instead. */
  followRedirects?: boolean;
  maxRedirects?: number;
}

export interface WwwHtmlResponse {
  status: number;
  /** URL of the final response after redirects. */
  url: string;
  html: string;
  response: Response;
}

export interface WwwClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Shared limiter (the server passes DdbClient's instance). */
  rateLimiter?: RateLimiter;
  /** Seed cookies directly (used by tests). */
  cookies?: Iterable<WwwCookie>;
  /** Load cookies from ~/.dndbeyond-mcp/config.json on first request. Defaults to true. */
  loadSavedCookies?: boolean;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; dndbeyond-mcp/0.1; +https://github.com/dndbeyond-mcp)";
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/**
 * Minimal client for www.dndbeyond.com HTML endpoints and form pages.
 *
 * Uses cookie auth only (no bearer token), follows redirects manually so that
 * Set-Cookie headers from every hop are retained, and can fetch the
 * RequestVerificationToken used by the site's AJAX form posts.
 */
export class WwwClient {
  readonly cookies: CookieJar;
  private readonly baseUrl: string;
  private readonly trustedOrigin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly loadSavedCookies: boolean;
  private readonly rateLimiter?: RateLimiter;
  private loaded = false;

  constructor(options: WwwClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DDB_WATERDEEP;
    this.trustedOrigin = new URL(this.baseUrl).origin;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.loadSavedCookies = options.loadSavedCookies ?? true;
    this.rateLimiter = options.rateLimiter;
    this.cookies = new CookieJar(options.cookies ?? []);
  }

  /**
   * Drops cached cookies and forces the next request to reload saved credentials.
   * Used after setup_auth replaces ~/.dndbeyond-mcp/config.json.
   */
  reset(): void {
    this.cookies.clear();
    this.loaded = false;
  }

  /**
   * Sends a request with cookie auth. Redirects are followed manually so that
   * cookies set on intermediate responses are kept. Returns the final Response.
   */
  async request(
    pathOrUrl: string,
    options: WwwRequestOptions = {},
  ): Promise<Response> {
    const { response } = await this.requestFollowingRedirects(pathOrUrl, options);
    return response;
  }

  /**
   * Fetches an HTML page, following redirects and retaining cookies.
   * Throws HttpError for non-2xx responses.
   */
  async getHtml(
    pathOrUrl: string,
    options: WwwRequestOptions = {},
  ): Promise<WwwHtmlResponse> {
    const { response, url } = await this.requestFollowingRedirects(pathOrUrl, {
      ...options,
      method: options.method ?? "GET",
    });
    const html = await response.text();

    if (!response.ok) {
      throw new HttpError(
        `D&D Beyond website error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return { status: response.status, url, html, response };
  }

  /**
   * Returns the RequestVerificationToken used by AJAX form posts. If the cookie
   * is missing, asks the site to issue one, exactly like the website does.
   */
  async getRequestVerificationToken(): Promise<string> {
    await this.ensureLoaded();

    const existing = this.cookies.get("RequestVerificationToken");
    if (existing) return existing;

    const response = await this.request(
      ENDPOINTS.homebrew.refreshRequestVerificationToken(),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );

    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        `Could not obtain a request verification token: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    await response.body?.cancel();

    const token = this.cookies.get("RequestVerificationToken");
    if (!token) {
      throw new Error(
        "D&D Beyond did not set a RequestVerificationToken cookie.",
      );
    }
    return token;
  }

  private async requestFollowingRedirects(
    pathOrUrl: string,
    options: WwwRequestOptions,
  ): Promise<{ response: Response; url: string }> {
    await this.ensureLoaded();

    let url = this.resolveUrl(pathOrUrl);
    let method = (options.method ?? "GET").toUpperCase();
    let body = options.body ?? null;
    const maxRedirects = options.maxRedirects ?? 5;

    for (let redirectCount = 0; ; redirectCount++) {
      const headers: Record<string, string> = {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: DEFAULT_ACCEPT,
        ...options.headers,
      };
      const cookieHeader = this.cookies.toHeader();
      if (cookieHeader) headers.Cookie = cookieHeader;

      await this.rateLimiter?.acquire();

      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        redirect: "manual",
      });

      this.cookies.applySetCookieHeaders(getSetCookieHeaders(response.headers));

      if (options.followRedirects === false || !isRedirect(response.status)) {
        return { response, url };
      }

      const location = response.headers.get("location");
      if (!location) return { response, url };
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects while fetching ${url}`);
      }

      // A redirect response body will never be used.
      await response.body?.cancel();
      const redirectUrl = new URL(location, url);
      this.assertTrustedUrl(redirectUrl);
      url = redirectUrl.toString();

      // 303 always becomes GET. 301/302 do the same for non-GET requests, which
      // mirrors browser behaviour for HTML form submissions.
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          method !== "GET" &&
          method !== "HEAD")
      ) {
        method = "GET";
        body = null;
      }
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    if (!this.loadSavedCookies) {
      this.loaded = true;
      return;
    }

    const cookies = await getAllCookies();
    if (cookies.length === 0) {
      // Leave `loaded` false so a later request can pick up credentials saved
      // by setup_auth in the same process.
      throw new Error("Not authenticated. Run setup first.");
    }
    for (const cookie of cookies) {
      this.cookies.set(cookie.name, cookie.value);
    }
    this.loaded = true;
  }

  private resolveUrl(pathOrUrl: string): string {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, this.baseUrl);
    this.assertTrustedUrl(url);
    return url.toString();
  }

  private assertTrustedUrl(url: URL): void {
    if (url.protocol !== "https:" || url.origin !== this.trustedOrigin) {
      throw new Error(
        `Refusing to send a D&D Beyond request to untrusted URL ${url.origin} ` +
          `(expected ${this.trustedOrigin} over HTTPS).`,
      );
    }
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export type FormFields = Record<string, string[]>;

/**
 * Extracts the submittable fields from a form (or the whole document when no
 * selector is given). Repeated names are preserved as arrays. File inputs are
 * ignored because their values are not part of the field map.
 */
export function extractFormFields(html: string, selector?: string): FormFields {
  const root = parse(html);
  const scope = selector ? root.querySelector(selector) : root;
  if (!scope) return {};

  const fields: FormFields = {};
  const add = (name: string, value: string): void => {
    (fields[name] ??= []).push(value);
  };

  for (const input of scope.querySelectorAll("input")) {
    const name = input.getAttribute("name");
    if (!name || input.hasAttribute("disabled")) continue;

    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    if (type === "file") continue;
    if (
      (type === "checkbox" || type === "radio") &&
      !input.hasAttribute("checked")
    ) {
      continue;
    }

    const fallback = type === "checkbox" || type === "radio" ? "on" : "";
    add(name, input.getAttribute("value") ?? fallback);
  }

  for (const textarea of scope.querySelectorAll("textarea")) {
    const name = textarea.getAttribute("name");
    if (!name || textarea.hasAttribute("disabled")) continue;
    add(name, textarea.textContent ?? "");
  }

  for (const select of scope.querySelectorAll("select")) {
    const name = select.getAttribute("name");
    if (!name || select.hasAttribute("disabled")) continue;

    const options = select.querySelectorAll("option");
    const selectedOptions = options.filter((option) =>
      option.hasAttribute("selected"),
    );

    // A single select with no explicit selection submits its first option.
    // A multiple select with no selection submits nothing.
    const values = select.hasAttribute("multiple")
      ? selectedOptions
      : selectedOptions.length > 0
        ? selectedOptions
        : options.slice(0, 1);

    for (const selected of values) {
      add(
        name,
        selected.getAttribute("value") ?? selected.textContent.trim(),
      );
    }
  }

  return fields;
}

export interface FormTokens {
  securityToken: string;
  authenticityToken: string;
}

/**
 * Reads the hidden per-page anti-forgery inputs required by homebrew form POSTs.
 */
export function extractFormTokens(html: string, selector?: string): FormTokens {
  const fields = extractFormFields(html, selector);
  const securityToken = fields["security-token"]?.[0];
  const authenticityToken = fields["authenticity-token"]?.[0];

  if (!securityToken || !authenticityToken) {
    throw new Error(
      "The page did not contain security-token and authenticity-token fields.",
    );
  }

  return { securityToken, authenticityToken };
}

let defaultClient: WwwClient | undefined;

/** Shared client so the cookie jar survives across tool calls. */
export function getWwwClient(rateLimiter?: RateLimiter): WwwClient {
  defaultClient ??= new WwwClient({ rateLimiter });
  return defaultClient;
}

/**
 * Clears the shared client's cookies and forces the next request to reload
 * credentials from disk. Call after setup_auth saves a new session.
 */
export function resetWwwClient(): void {
  defaultClient?.reset();
}
