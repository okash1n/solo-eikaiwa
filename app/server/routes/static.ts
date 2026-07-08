import path from "node:path";
import { existsSync, statSync } from "node:fs";

/** 静的配信の依存。省略時は実 dist（paths.ts の CLIENT_DIST_DIR）を使う。テストでは temp dir を注入する。 */
export type StaticRoutesDeps = {
  staticDir?: string;
};

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isRegularFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

const DIST_MISSING_HINT = "client dist not built — run: cd app/client && bun run build\n";

/**
 * /api/* 以外の GET を app/client/dist から配信する（Caddy の `try_files {path} /index.html` 相当）。
 * pathname は `new URL(req.url).pathname` を渡す想定（呼び出し側で正規化済み）。ただし `new URL()` は
 * リテラルな `..` は畳むが `%2f` 等でエンコードされたセパレータは畳まない（そこが本来のエスケープ経路）ため、
 * ここでは decode → distDir 配下への containment チェックを最終防御として必ず行う（SPA フォールバックはしない＝404）。
 */
export function serveStatic(method: string, pathname: string, distDir: string): Response {
  if (method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  if (!existsSync(distDir)) {
    return new Response(DIST_MISSING_HINT, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (decoded.includes("\0")) return new Response("Bad Request", { status: 400 });

  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(distDir, relative);
  const distRootWithSep = distDir.endsWith(path.sep) ? distDir : distDir + path.sep;
  if (resolved !== distDir && !resolved.startsWith(distRootWithSep)) {
    return new Response("Not Found", { status: 404 });
  }

  const indexPath = path.join(distDir, "index.html");
  const filePath = isRegularFile(resolved) ? resolved : indexPath;
  if (!isRegularFile(filePath)) return new Response("Not Found", { status: 404 });

  const isIndex = filePath === indexPath;
  const cacheControl = isIndex ? "no-cache" : decoded.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  return new Response(Bun.file(filePath), {
    status: 200,
    headers: { "content-type": contentTypeFor(filePath), "cache-control": cacheControl },
  });
}
