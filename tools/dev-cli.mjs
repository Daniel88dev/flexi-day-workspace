#!/usr/bin/env node
import { devApi, devConfig, signInUrlFor, stackStatus } from "./lib/devApi.mjs";

const [command, ...rest] = process.argv.slice(2);

const flag = (name) => {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
};

const mark = (ok) => (ok ? "✅" : "❌");

const commands = {
  async status() {
    const status = await stackStatus();
    console.log(`${mark(status.postgres.up)} postgres   :${status.postgres.port}`);
    console.log(`${mark(status.backend.up)} backend    ${status.backend.url}`);
    console.log(`${mark(status.frontend.up)} frontend   ${status.frontend.url}`);

    if (!status.devTools.configured) {
      console.log("❌ dev tools  DEV_TOOLS_ENABLED is not true in flexi-day-be/.env");
      return;
    }
    if (status.devTools.error) {
      console.log(`❌ dev tools  ${status.devTools.error}`);
      return;
    }
    if (status.devTools.status) {
      const dev = status.devTools.status;
      console.log(
        `✅ dev tools  env=${dev.environment} db=${dev.databaseHost} domain=@${dev.seedEmailDomain} seededUsers=${dev.seededUsers}`
      );
    }
  },

  async seed() {
    const email = flag("email") ?? `owner@${devConfig.seedDomain}`;
    const result = await devApi("/users", {
      email,
      name: flag("name"),
      password: flag("password"),
      teamName: flag("team") ?? "Dev Team",
    });
    console.log(`user     ${result.user.email} (${result.user.created ? "created" : "existing"})`);
    console.log(`password ${result.user.password}`);
    if (result.team) console.log(`team     ${result.team.groupName}`);
    console.log(`sign in  ${signInUrlFor(result.user.email)}`);
  },

  async scenario() {
    const result = await devApi("/scenario", {
      teamName: flag("team"),
      ownerEmail: flag("email"),
      password: flag("password"),
    });
    console.log(`team      ${result.team.groupName}`);
    console.log(`owner     ${result.owner.email}`);
    console.log(`members   ${result.members.map((m) => m.email).join(", ")}`);
    console.log(`password  ${result.owner.password} (shared by every seeded account)`);
    console.log(`bookings  ${result.vacationsCreated}`);
    console.log(`sign in   ${signInUrlFor(result.owner.email)}`);
  },

  async login() {
    const email = rest[0] ?? `owner@${devConfig.seedDomain}`;
    const result = await devApi("/session", { email });
    console.log(`user    ${result.user.name} <${result.user.email}>`);
    console.log(`cookie  ${result.cookieHeader}`);
    console.log(`browser ${signInUrlFor(email)}`);
    console.log(`curl    curl -H 'Cookie: ${result.cookieHeader}' ${devConfig.apiUrl}/api/group`);
  },

  async reset() {
    const result = await devApi("/reset", {});
    console.log(`deleted ${result.deleted.users} users and ${result.deleted.groups} teams`);
  },
};

if (!command || !commands[command]) {
  console.log(`Usage: npm run dev:<command>

  status                       what is running, and whether dev tools are live
  seed [--email --team ...]    one verified user (+ team, quota)
  scenario [--team --email]    a whole team with quotas and bookings
  login [email]                issue a session cookie for an existing local user
  reset                        delete every @${devConfig.seedDomain} account and its data
`);
  process.exit(command ? 1 : 0);
}

try {
  await commands[command]();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
