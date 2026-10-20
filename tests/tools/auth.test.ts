import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_FLOW_MODULE = "../../setup/auth-flow.js";

describe("setupAuth", () => {
  afterEach(() => {
    vi.doUnmock(AUTH_FLOW_MODULE);
    vi.resetModules();
  });

  it("returns setup instructions when playwright is not installed", async () => {
    vi.doMock(AUTH_FLOW_MODULE, () => ({
      get runAuthFlow() {
        const error = new Error(
          "Cannot find package 'playwright' imported from /repo/build/setup/auth-flow.js"
        ) as NodeJS.ErrnoException;
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      },
    }));

    const { setupAuth } = await import("../../src/tools/auth.js");
    const result = await setupAuth();

    expect(result.content[0].text).toBe(
      "Playwright is not installed; clone the repo, run npm install, then npm run setup."
    );
  });

  it("keeps the authentication failed path for other import errors", async () => {
    vi.doMock(AUTH_FLOW_MODULE, () => ({
      get runAuthFlow() {
        const error = new Error("Cannot find module '../missing.js'") as NodeJS.ErrnoException;
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      },
    }));

    const { setupAuth } = await import("../../src/tools/auth.js");
    const result = await setupAuth();

    expect(result.content[0].text).toBe(
      "Authentication failed: Cannot find module '../missing.js'"
    );
  });

  it("keeps the authentication failed path when the auth flow throws", async () => {
    vi.doMock(AUTH_FLOW_MODULE, () => ({
      runAuthFlow: async () => {
        throw new Error("Login timed out after 5 minutes");
      },
    }));

    const { setupAuth } = await import("../../src/tools/auth.js");
    const result = await setupAuth();

    expect(result.content[0].text).toBe(
      "Authentication failed: Login timed out after 5 minutes"
    );
  });
});
