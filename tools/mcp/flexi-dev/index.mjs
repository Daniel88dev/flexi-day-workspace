#!/usr/bin/env node
/**
 * `flexi-dev` — stdio MCP server over the backend's local `/api/dev` surface.
 * Everything it can do is already gated backend-side (loopback peer, shared
 * token, local database, non-production env); this server only saves the agent
 * from shelling out.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { devApi, devConfig, signInUrlFor, stackStatus } from "../../lib/devApi.mjs";
import { signInOnSimulator } from "../../lib/simulator.mjs";

const server = new McpServer({ name: "flexi-dev", version: "1.0.0" });

const text = (value) => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});

const failed = (err) => ({
  content: [{ type: "text", text: `Error: ${err.message}` }],
  isError: true,
});

const tool = (name, config, run) =>
  server.registerTool(name, config, async (args) => {
    try {
      return text(await run(args ?? {}));
    } catch (err) {
      return failed(err);
    }
  });

tool(
  "stack_status",
  {
    title: "Flexi Day stack status",
    description:
      "Reports whether Postgres, the backend API, the frontend dev server and Metro (iPhone dev client) are up, and whether the local dev tooling endpoints are live. Call this first when anything seems not to work.",
    inputSchema: {},
  },
  () => stackStatus()
);

tool(
  "dev_seed_user",
  {
    title: "Seed a local user",
    description:
      "Creates (or reuses) a verified local user that can sign in immediately — no email verification. Optionally creates a team with the user as manager/approver plus a current-year quota. Limited to the seed email domain.",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
      name: z.string().optional(),
      password: z.string().optional().describe("omit to get a generated one back"),
      teamName: z.string().optional().describe("omit to skip team creation"),
    },
  },
  async (args) => {
    const result = await devApi("/users", {
      email: args.email ?? `owner@${devConfig.seedDomain}`,
      name: args.name,
      password: args.password,
      teamName: args.teamName,
    });
    return { ...result, signInUrl: signInUrlFor(result.user.email) };
  }
);

tool(
  "dev_seed_scenario",
  {
    title: "Seed a full team scenario",
    description:
      "Seeds an owner/approver, three members, current-year quotas and eleven bookings spread across pending/approved/rejected, so every dashboard widget and the approvals queue have content. Also seeds Dev Support, a second team in the owner's organization run by dave@dev.local, which the owner administers without being a member, with two more members, quotas and eight bookings. Safe to re-run.",
    inputSchema: {
      teamName: z.string().optional(),
      ownerEmail: z.string().optional(),
      password: z.string().optional().describe("shared by every seeded account"),
    },
  },
  (args) => devApi("/scenario", args)
);

tool(
  "dev_login",
  {
    title: "Get a session for a local user",
    description:
      "Issues a signed better-auth session cookie for an existing local user. Use signInUrl to put a browser into that session in one navigation, or cookieHeader for direct API calls. cookieInjection only works in a browser with no session cookie already set (the real one is httpOnly and cannot be overwritten from JS).",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
    },
  },
  async (args) => {
    const email = args.email ?? `owner@${devConfig.seedDomain}`;
    const result = await devApi("/session", { email });
    return {
      ...result,
      signInUrl: signInUrlFor(email),
      cookieInjection: `document.cookie = ${JSON.stringify(`${result.cookieHeader}; path=/`)}`,
    };
  }
);

tool(
  "dev_login_rn",
  {
    title: "Sign a local user into the iPhone app",
    description:
      "Mints a single-use, 60-second dev sign-in ticket and opens flexiday://dev-sign-in on a booted simulator with xcrun simctl openurl. The app drops any previous session and lands signed in on `to`. Fails when dev tools are off, the user is unknown, no simulator is booted, or several are booted and no udid is given. The Flexi Day dev client should already be running and connected to Metro: a cold start has to finish inside the ticket's 60 seconds, so the result carries a warning when the app was not running and the sign-in may fail.",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
      to: z
        .string()
        .optional()
        .describe("in-app path to land on, e.g. /requests; defaults to /dashboard"),
      udid: z
        .string()
        .optional()
        .describe("simulator udid; required when more than one simulator is booted"),
    },
  },
  (args) =>
    signInOnSimulator({
      email: args.email ?? `owner@${devConfig.seedDomain}`,
      to: args.to,
      udid: args.udid,
    })
);

tool(
  "dev_set_plan",
  {
    title: "Force a billing plan state",
    description:
      "Forces a billing state on a local user's organization without touching Paddle. States: FREE/PRO/ENTERPRISE/CUSTOM set a manual plan override; GRACE simulates a lapsed Pro plan still inside its 14-day grace window; EXPIRED simulates one past grace (over-limit groups go read-only); CLEAR removes all forced state. Returns the resolved entitlements.",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
      state: z
        .enum(["FREE", "PRO", "ENTERPRISE", "CUSTOM", "GRACE", "EXPIRED", "CLEAR"])
        .describe("the billing state to force"),
      manualMaxGroups: z.number().optional().describe("CUSTOM only: group limit"),
      manualMaxMembersPerGroup: z.number().optional().describe("CUSTOM only: members per group"),
    },
  },
  (args) =>
    devApi("/billing/set-plan", {
      email: args.email ?? `owner@${devConfig.seedDomain}`,
      state: args.state,
      manualMaxGroups: args.manualMaxGroups,
      manualMaxMembersPerGroup: args.manualMaxMembersPerGroup,
    })
);

const calendarProvider = z.enum(["google", "microsoft"]);

tool(
  "dev_calendar_connect",
  {
    title: "Connect a local user to the fake calendar driver",
    description:
      "Connects a seeded user to a fake Google or Microsoft calendar with no consent round, and makes or reuses the sync config that feeds it. Without configId it reuses the config this connection already feeds, or creates a ME config with every record type. Grants no plan: a Free user's target pauses (entitled: false). Answers 409 unless the backend runs CALENDAR_SYNC_DRIVER=fake with that provider's switch on. dev_seed_scenario already connects the owner when it can.",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
      provider: calendarProvider.optional().describe("defaults to google"),
      configId: z.string().optional().describe("an existing sync config of this user to target"),
      timeZone: z.string().optional().describe("IANA zone; defaults to Europe/Prague"),
    },
  },
  (args) =>
    devApi("/calendar/connect", {
      email: args.email ?? `owner@${devConfig.seedDomain}`,
      provider: args.provider,
      configId: args.configId,
      timeZone: args.timeZone,
    })
);

tool(
  "dev_calendar_events",
  {
    title: "Read what the fake calendar driver received",
    description:
      "Returns events, every call the fake calendar driver received (operation INSERT/PATCH/DELETE, providerEventId, payload, result 'ok' or the failure), and ledger, the calendar_sync_events rows (one per target and day row). Both newest first, up to 500 each. An event is live when it has an ok INSERT and no ok DELETE. Rows go with their connection, so after a disconnect neither the inserts nor the purge's deletes show.",
    inputSchema: {
      email: z.string().optional().describe("one user's rows; omit for everyone's"),
    },
  },
  (args) =>
    devApi(`/calendar/events${args.email ? `?${new URLSearchParams({ email: args.email })}` : ""}`)
);

tool(
  "dev_calendar_capability",
  {
    title: "Set a calendar connection's capability",
    description:
      "Sets a seeded user's calendar connection to PLAIN (no status event types, like personal Gmail), STATUS or UNKNOWN, and marks its targets due so the next sync rebuilds every event. Name the provider when the user has both connected. Returns targetsMarked, the config ids queued for resync.",
    inputSchema: {
      email: z.string().optional().describe(`defaults to owner@${devConfig.seedDomain}`),
      provider: calendarProvider.optional(),
      capability: z.enum(["PLAIN", "STATUS", "UNKNOWN"]),
    },
  },
  (args) =>
    devApi("/calendar/capability", {
      email: args.email ?? `owner@${devConfig.seedDomain}`,
      provider: args.provider,
      capability: args.capability,
    })
);

tool(
  "dev_reset",
  {
    title: "Delete seeded data",
    description: `Deletes every @${devConfig.seedDomain} account and the teams, memberships, quotas and bookings hanging off them. Accounts outside that domain are never touched.`,
    inputSchema: {},
  },
  () => devApi("/reset", {})
);

await server.connect(new StdioServerTransport());
