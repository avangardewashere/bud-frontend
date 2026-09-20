/**
 * The courses origin, for local development.
 *
 * Course HTML is author-controlled JavaScript. It must never run on the same
 * origin as the shell, or it could read the session cookie and the shell's DOM.
 * In production this is courses.<domain>; here it is 127.0.0.1:3101, which the
 * browser treats as a different origin from localhost:3100 — different host,
 * different origin, same isolation. (3101 rather than 3001 because 3001 is
 * often already taken; override with COURSES_PORT.)
 *
 * Serves  /{courseId}/{version}/{path}  out of ./courses, injecting bridge.js
 * into every HTML entry and setting the CSP the production server will set.
 *
 *   node tools/courses-server.mjs
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readFile, readdir } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../courses/", import.meta.url));
const PORT = Number(process.env.COURSES_PORT ?? 3101);
const HOST = process.env.COURSES_HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3100";
const COURSES_ORIGIN = process.env.COURSES_ORIGIN ?? `http://${HOST}:${PORT}`;

/** Allowlist doubles as the upload allowlist in Tech-Information.md §11. */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Note on 'self': a document sandboxed without allow-same-origin has an opaque
 * origin, so 'self' matches nothing. Every source is therefore named outright.
 *
 * The worksheets carry inline <style> and <script>, so both need 'unsafe-inline'.
 * That is acceptable for an opaque-origin frame with no cookie or storage access;
 * the long-term fix is hashing inline scripts at upload time.
 */
const CSP = [
  `default-src 'none'`,
  `script-src ${COURSES_ORIGIN} ${APP_ORIGIN} 'unsafe-inline'`,
  `style-src ${COURSES_ORIGIN} 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src https://fonts.gstatic.com data:`,
  `img-src ${COURSES_ORIGIN} data:`,
  `connect-src 'none'`,
  `form-action 'none'`,
  `base-uri 'none'`,
  `frame-ancestors ${APP_ORIGIN}`,
].join("; ");

const BRIDGE_TAG = `<script src="${APP_ORIGIN}/bridge.js"></script>`;

/**
 * The Docker worksheets are fragments: no <html> or <head>, they open straight
 * with <meta charset>. Put the bridge after that meta when there is no head to
 * use, so the charset declaration stays first in the document.
 */
function inject(html) {
  // `<head(\s...)?>` and not `<head[^>]*>`, which also matches <header>.
  const head = html.match(/<head(\s[^>]*)?>/i);
  if (head) return html.replace(head[0], `${head[0]}\n${BRIDGE_TAG}`);

  const charset = html.match(/<meta[^>]+charset[^>]*>/i);
  if (charset) return html.replace(charset[0], `${charset[0]}\n${BRIDGE_TAG}`);

  return `${BRIDGE_TAG}\n${html}`;
}

/**
 * Dev-only: fall back to whatever version of a course is on disk.
 *
 * The API addresses content as /{course}/{version}/{path} and the real origin serves
 * it out of object storage, where every ingested version exists. These local fixtures
 * are a copy of one version, so a re-ingest on the backend moves the version and every
 * request 404s. Serving the version that is here, loudly, beats a blank frame — but it
 * is a stand-in, and the warning is there so nobody mistakes it for the real thing.
 */
async function fallbackVersion(urlPath) {
  const [, course, version, ...rest] = urlPath.split("/");
  if (!course || !version || rest.length === 0) return null;

  let available;
  try {
    available = (await readdir(join(ROOT, course), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return null;
  }

  const substitute = available.at(-1);
  if (!substitute || substitute === version) return null;

  console.warn(
    `! ${course}: no local copy of ${version}; serving ${substitute} instead. ` +
      `These fixtures are a stand-in for object storage.`,
  );
  return `/${course}/${substitute}/${rest.join("/")}`;
}

function resolveSafe(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const target = normalize(join(ROOT, decoded.replace(/^\/+/, "")));
  // normalize() collapses "..", so anything still outside ROOT is an escape.
  return target.startsWith(ROOT) ? target : null;
}

const server = createServer(async (req, res) => {
  const send = (code, body, headers = {}) => {
    console.log(`${code} ${req.method} ${req.url}`);
    res.writeHead(code, { "x-content-type-options": "nosniff", ...headers });
    res.end(body);
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(405, "method not allowed", { "content-type": "text/plain" });
  }

  const url = new URL(req.url, COURSES_ORIGIN);
  if (url.pathname === "/health") {
    return send(200, "ok", { "content-type": "text/plain" });
  }

  let file = resolveSafe(url.pathname);
  if (!file) return send(403, "forbidden", { "content-type": "text/plain" });

  let info;
  try {
    info = await stat(file);
  } catch {
    const substitute = await fallbackVersion(url.pathname);
    const retry = substitute && resolveSafe(substitute);
    if (!retry) return send(404, "not found", { "content-type": "text/plain" });
    try {
      info = await stat(retry);
      file = retry;
    } catch {
      return send(404, "not found", { "content-type": "text/plain" });
    }
  }
  if (!info.isFile()) return send(404, "not found", { "content-type": "text/plain" });

  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return send(415, "unsupported type", { "content-type": "text/plain" });

  const headers = {
    "content-type": type,
    "content-security-policy": CSP,
    // Dev only. In production a course version is immutable and cached hard.
    "cache-control": "no-store",
  };

  if (type.startsWith("text/html")) {
    return send(200, inject(await readFile(file, "utf8")), headers);
  }

  console.log(`200 ${req.method} ${req.url}`);
  res.writeHead(200, { "x-content-type-options": "nosniff", ...headers });
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`courses origin  ${COURSES_ORIGIN}`);
  console.log(`serving         ${ROOT}`);
  console.log(`framed by       ${APP_ORIGIN}`);
});
