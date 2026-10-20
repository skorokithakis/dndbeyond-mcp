import { isAuthenticated } from "../api/auth.js";
import type { DdbClient } from "../api/client.js";

interface CallToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

function isMissingPlaywrightError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes("playwright")
  );
}

function authFailure(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: `Authentication failed: ${message}`,
      },
    ],
  };
}

export async function setupAuth(): Promise<CallToolResult> {
  let runAuthFlow: () => Promise<void>;

  try {
    ({ runAuthFlow } = await import("../../setup/auth-flow.js"));
  } catch (error) {
    if (isMissingPlaywrightError(error)) {
      return {
        content: [
          {
            type: "text",
            text: "Playwright is not installed; clone the repo, run npm install, then npm run setup.",
          },
        ],
      };
    }
    return authFailure(error);
  }

  try {
    await runAuthFlow();
    return {
      content: [
        {
          type: "text",
          text: "Authentication successful! A browser window was opened for you to log in to D&D Beyond. Your CobaltSession cookie has been saved to ~/.dndbeyond-mcp/config.json. You can now use authenticated endpoints.",
        },
      ],
    };
  } catch (error) {
    return authFailure(error);
  }
}

export async function checkAuth(client: DdbClient): Promise<CallToolResult> {
  const hasSession = await isAuthenticated();
  const expired = client.isAuthExpired;

  if (!hasSession) {
    return {
      content: [
        {
          type: "text",
          text: "Not authenticated — run setup_auth to log in via browser.",
        },
      ],
    };
  }

  if (expired) {
    return {
      content: [
        {
          type: "text",
          text: "Session expired (received 401 from API) — run setup_auth to refresh your credentials.",
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: "Authenticated — CobaltSession cookie found and no 401 errors detected.",
      },
    ],
  };
}
