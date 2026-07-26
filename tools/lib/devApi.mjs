import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND_ENV = resolve(WORKSPACE_ROOT, "flexi-day-be/.env");

/** Minimal KEY=VALUE reader — the tooling must not depend on the sub-repos' node_modules. */
function readEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const out = {};
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const backendEnv = readEnvFile(BACKEND_ENV);

export const devConfig = {
  workspaceRoot: WORKSPACE_ROOT,
  apiUrl: process.env.FLEXI_API_URL ?? `http://localhost:${backendEnv.PORT ?? "8080"}`,
  appUrl: process.env.FLEXI_APP_URL ?? backendEnv.APP_URL ?? "http://localhost:3000",
  token: process.env.DEV_TOOLS_TOKEN ?? backendEnv.DEV_TOOLS_TOKEN ?? "",
  seedDomain: backendEnv.DEV_SEED_EMAIL_DOMAIN ?? "dev.local",
  enabled: backendEnv.DEV_TOOLS_ENABLED === "true",
  databaseUrl: backendEnv.DATABASE ?? "",
};

export class DevApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DevApiError";
    this.status = status;
  }
}

export async function devApi(path, body) {
  if (!devConfig.token) {
    throw new DevApiError(
      `No DEV_TOOLS_TOKEN found in ${BACKEND_ENV}. Set DEV_TOOLS_ENABLED=true and DEV_TOOLS_TOKEN there.`,
      0
    );
  }

  let res;
  try {
    res = await fetch(`${devConfig.apiUrl}/api/dev${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-dev-token": devConfig.token,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new DevApiError(
      `Cannot reach the backend at ${devConfig.apiUrl} (${err.message}). Start it with: npm run dev:be`,
      0
    );
  }

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      parsed?.errors?.[0]?.message ?? parsed?.message ?? `Dev request failed (${res.status})`;
    throw new DevApiError(message, res.status);
  }
  return parsed;
}

function probeTcp(port, host = "127.0.0.1", timeout = 700) {
  return new Promise((done) => {
    const socket = new net.Socket();
    const finish = (ok) => {
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function probeHttp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** One shot answer to "what is actually running right now". */
export async function stackStatus() {
  const dbPort = Number(new URL(devConfig.databaseUrl || "postgres://localhost:5432").port || 5432);

  const [postgres, backend, frontend] = await Promise.all([
    probeTcp(dbPort),
    probeHttp(`${devConfig.apiUrl}/health`),
    probeTcp(new URL(devConfig.appUrl).port || 3000),
  ]);

  let dev = null;
  let devError = null;
  if (backend) {
    try {
      dev = await devApi("/status");
    } catch (err) {
      devError = err.message;
    }
  }

  return {
    postgres: { port: dbPort, up: postgres },
    backend: { url: devConfig.apiUrl, up: backend },
    frontend: { url: devConfig.appUrl, up: frontend },
    devTools: { configured: devConfig.enabled, status: dev, error: devError },
  };
}

export const signInUrlFor = (email) =>
  `${devConfig.appUrl}/dev-sign-in/?email=${encodeURIComponent(email)}`;
