import { spawnSync } from "node:child_process";

export function github(method, path, body) {
  const args = ["api", "--method", method, path];
  if (body !== undefined) args.push("--input", "-");
  const result = spawnSync("gh", args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    const error = new Error(`GitHub ${method} ${path} failed: ${(result.stderr || result.error?.message || "unknown error").trim()}`);
    error.status = /HTTP (\d{3})/.exec(result.stderr || "")?.[1];
    throw error;
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

export function allPages(api, path) {
  const rows = [];
  for (let page = 1; ; page++) {
    const batch = api("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
}
