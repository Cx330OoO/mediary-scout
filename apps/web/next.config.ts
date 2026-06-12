import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Next only auto-loads .env files from the app directory; this workspace
// keeps ALL runtime config (TMDB token, 115 cookie, adapter switches) in the
// repo-root .env. Load it here without overriding anything already set.
try {
  const repoRootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
  for (const line of readFileSync(repoRootEnv, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
} catch {
  // no .env present (CI, fresh clone) — fine, fall back to process env
}

const nextConfig: NextConfig = {
  transpilePackages: ["@media-track/workflow"],
  // Cache Components: PPR becomes the default rendering model. "use cache"
  // builds the static shell; runtime reads live inside Suspense holes.
  cacheComponents: true,
};

export default nextConfig;
