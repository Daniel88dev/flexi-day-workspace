import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { devApi, devConfig, DevApiError } from "./devApi.mjs";

const run = promisify(execFile);

const APP_BUNDLE_ID = "com.flexiday.app";

async function simctl(...args) {
  try {
    const { stdout } = await run("xcrun", ["simctl", ...args]);
    return stdout;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new DevApiError("xcrun is not on PATH. Install Xcode and its command line tools.", 0);
    }
    const detail = err.stderr?.trim() || err.message;
    throw new DevApiError(`xcrun simctl ${args[0]} failed: ${detail}`, 0);
  }
}

const runtimeLabel = (runtime) => {
  const match = /SimRuntime\.([A-Za-z]+)-(\d+(?:-\d+)*)$/.exec(runtime);
  return match ? `${match[1]} ${match[2].replaceAll("-", ".")}` : runtime;
};

async function listSimulators() {
  const { devices } = JSON.parse(await simctl("list", "devices", "--json"));
  return Object.entries(devices).flatMap(([runtime, list]) =>
    list.map((device) => ({
      udid: device.udid,
      name: device.name,
      state: device.state,
      runtime: runtimeLabel(runtime),
    }))
  );
}

const describe = (sim) => `${sim.name} (${sim.runtime}, ${sim.udid})`;

async function resolveSimulator(udid) {
  const simulators = await listSimulators();

  if (udid) {
    const sim = simulators.find((s) => s.udid.toLowerCase() === udid.toLowerCase());
    if (!sim) {
      throw new DevApiError(
        `No simulator with udid ${udid}. List them with: xcrun simctl list devices available`,
        0
      );
    }
    if (sim.state !== "Booted") {
      throw new DevApiError(
        `Simulator ${describe(sim)} is ${sim.state.toLowerCase()}. Boot it with: xcrun simctl boot ${sim.udid}`,
        0
      );
    }
    return sim;
  }

  const booted = simulators.filter((s) => s.state === "Booted");
  if (booted.length === 0) {
    throw new DevApiError(
      "No simulator is booted. Boot one with: xcrun simctl boot <udid> (list them with: xcrun simctl list devices available)",
      0
    );
  }
  if (booted.length > 1) {
    throw new DevApiError(
      `${booted.length} simulators are booted; pass the udid of one:\n` +
        booted.map((s) => `  ${describe(s)}`).join("\n"),
      0
    );
  }
  return booted[0];
}

async function assertAppInstalled(sim) {
  try {
    await run("xcrun", ["simctl", "get_app_container", sim.udid, APP_BUNDLE_ID]);
  } catch (err) {
    const detail = err.stderr?.trim() || err.message;
    if (!/no such file or directory|not installed|not found/i.test(detail)) {
      throw new DevApiError(`xcrun simctl get_app_container failed: ${detail}`, 0);
    }
    throw new DevApiError(
      `The Flexi Day dev client (${APP_BUNDLE_ID}) is not installed on ${describe(sim)}. ` +
        `Build it from flexi-day-rn, or install an existing build with: xcrun simctl install ${sim.udid} <path to .app>`,
      0
    );
  }
}

async function isAppRunning(sim) {
  try {
    const out = await simctl("spawn", sim.udid, "launchctl", "list");
    return out.includes(`UIKitApplication:${APP_BUNDLE_ID}`);
  } catch {
    // Fails open on purpose: a launchctl hiccup must never block the sign-in.
    return true;
  }
}

const isInAppPath = (path) => path.startsWith("/") && !path.startsWith("//") && !path.includes(":");

async function mintTicket(email) {
  if (!devConfig.enabled) {
    throw new DevApiError(
      "Dev tools are off: DEV_TOOLS_ENABLED is not true in flexi-day-be/.env. Set it, restart the backend, and try again.",
      0
    );
  }
  try {
    return await devApi("/sign-in-ticket", { email });
  } catch (err) {
    if (err.status === 404 || /no such user/i.test(err.message)) {
      throw new DevApiError(
        `No user ${email} in the local database. Seed one with: npm run dev:scenario`,
        404
      );
    }
    if (/invalid dev token/i.test(err.message)) {
      throw new DevApiError(
        `The backend at ${devConfig.apiUrl} rejected DEV_TOOLS_TOKEN. It was started with a different ` +
          "token than flexi-day-be/.env holds now: restart it.",
        err.status
      );
    }
    if (err.status === 401) {
      throw new DevApiError(
        `The backend at ${devConfig.apiUrl} refused the sign-in ticket (${err.status} ${err.message}). ` +
          "Its dev tools are off or it predates the ticket route: restart it with DEV_TOOLS_ENABLED=true " +
          "and the DEV_TOOLS_TOKEN from flexi-day-be/.env.",
        err.status
      );
    }
    throw err;
  }
}

/** The simulator is resolved before the ticket is minted, so a bad target never spends one. */
export async function signInOnSimulator({ email, to, udid }) {
  if (to !== undefined && !isInAppPath(to)) {
    throw new DevApiError(`The target must be an in-app path such as /requests, got "${to}".`, 0);
  }

  const simulator = await resolveSimulator(udid);
  await assertAppInstalled(simulator);
  const appWasRunning = await isAppRunning(simulator);

  const { user, ticket, expiresAt } = await mintTicket(email);

  const params = new URLSearchParams({ ticket });
  if (to) params.set("to", to);
  await simctl("openurl", simulator.udid, `flexiday://dev-sign-in?${params}`);

  return {
    user,
    simulator,
    to: to ?? "/dashboard",
    expiresAt,
    warning: appWasRunning
      ? undefined
      : "Flexi Day was not running, so iOS cold-started it. If the dev launcher lists servers, pick " +
        "Metro before the ticket expires, or launch the app first and run this again.",
  };
}
