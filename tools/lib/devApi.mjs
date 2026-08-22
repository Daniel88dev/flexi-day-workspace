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

// Interpolated into a URL below, where a non-numeric value would rewrite the host:
// `http://localhost:8080@evil.com` parses with hostname `evil.com`.
const backendPort = /^\d{1,5}$/.test(backendEnv.PORT ?? "") ? backendEnv.PORT : "8080";

export const devConfig = {
  workspaceRoot: WORKSPACE_ROOT,
  apiUrl: process.env.FLEXI_API_URL ?? `http://localhost:${backendPort}`,
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

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `devGuard` only answers callers on loopback, so a config pointing anywhere else cannot
 * succeed — it can only hand `DEV_TOOLS_TOKEN` to whoever is listening. Checks the parsed
 * hostname rather than the string, because `http://localhost:8080@evil.com` looks local.
 */
function assertLoopback(rawUrl, source) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DevApiError(`${source} is not a valid URL (${rawUrl}).`, 0);
  }

  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new DevApiError(
      `${source} must stay on loopback, but resolves to ${url.hostname} (${rawUrl}). ` +
        `Refusing to send DEV_TOOLS_TOKEN off this machine.`,
      0
    );
  }
  return url;
}

export async function devApi(path, body) {
  if (!devConfig.token) {
    throw new DevApiError(
      `No DEV_TOOLS_TOKEN found in ${BACKEND_ENV}. Set DEV_TOOLS_ENABLED=true and DEV_TOOLS_TOKEN there.`,
      0
    );
  }

  assertLoopback(devConfig.apiUrl, "The backend URL (FLEXI_API_URL or PORT)");

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
/** Reporting a broken setup is this command's job, so a malformed .env value must not crash it. */
function portOf(rawUrl, fallback) {
  try {
    return Number(new URL(rawUrl).port) || fallback;
  } catch {
    return fallback;
  }
}

export async function stackStatus() {
  const dbPort = portOf(devConfig.databaseUrl || "postgres://localhost:5432", 5432);

  const [postgres, backend, frontend] = await Promise.all([
    probeTcp(dbPort),
    probeHttp(`${devConfig.apiUrl}/health`),
    probeTcp(portOf(devConfig.appUrl, 3000)),
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
