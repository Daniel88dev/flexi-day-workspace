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
      "Reports whether Postgres, the backend API and the frontend dev server are up, and whether the local dev tooling endpoints are live. Call this first when anything seems not to work.",
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
      "Seeds an owner/approver, three members, current-year quotas and eleven bookings spread across pending/approved/rejected, so every dashboard widget and the approvals queue have content. Safe to re-run.",
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
