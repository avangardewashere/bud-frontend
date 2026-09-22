/**
 * A proxy in front of the Bud API that can be put to sleep — the way Render's free
 * instance sleeps — for exercising cold starts locally. See e2e/cold-start.spec.ts.
 *
 * While asleep it holds every request until the wake time and then forwards it, as
 * Render's own proxy does during a cold start. It can also make one exact path fail
 * with a JSON 500: the API awake, but broken.
 *
 *   node tools/sleepy-proxy.mjs            127.0.0.1:3197 -> http://localhost:3102
 *   SLEEPY_PORT, SLEEPY_TARGET             to change either
 *
 * Control endpoints (never forwarded):
 *   GET /__sleep?ms=25000                  asleep for 25s from now (0 wakes it)
 *   GET /__break?path=/me/dashboard        that exact path answers 500 JSON
 *   GET /__fix                             clear every break
 *   GET /__state                           { asleepForMs, broken, log }
 *
 * Point a production build of the shell at it — BUD_API_ORIGIN=http://127.0.0.1:3197
 * — since server components and the /api rewrite both read that at build time.
 */
import { createServer, request as httpRequest } from "node:http";

const PORT = Number(process.env.SLEEPY_PORT ?? 3197);
const TARGET = new URL(process.env.SLEEPY_TARGET ?? "http://localhost:3102");

let wakeAt = 0;
const broken = new Set();
const log = [];

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://proxy");

  switch (url.pathname) {
    case "/__sleep":
      wakeAt = Date.now() + Number(url.searchParams.get("ms") ?? 0);
      return json(res, 200, { wakeAt });
    case "/__break":
      broken.add(url.searchParams.get("path"));
      return json(res, 200, { broken: [...broken] });
    case "/__fix":
      broken.clear();
      return json(res, 200, { broken: [] });
    case "/__state":
      return json(res, 200, {
        asleepForMs: Math.max(0, wakeAt - Date.now()),
        broken: [...broken],
        log: log.slice(-100),
      });
  }

  const arrived = Date.now();
  const heldMs = Math.max(0, wakeAt - arrived);
  if (heldMs) await new Promise((resolve) => setTimeout(resolve, heldMs));
  log.push({ at: arrived, method: req.method, path: req.url, heldMs });
  if (log.length > 500) log.splice(0, log.length - 500);

  if (broken.has(url.pathname)) {
    return json(res, 500, {
      statusCode: 500,
      error: "Internal Server Error",
      message: "Broken on purpose by tools/sleepy-proxy.mjs",
      code: "internal_error",
    });
  }

  const upstream = httpRequest(
    {
      host: TARGET.hostname,
      port: TARGET.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: TARGET.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`sleepy-proxy: upstream error: ${error.message}`);
  });
  req.pipe(upstream);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`sleepy-proxy on http://127.0.0.1:${PORT} -> ${TARGET.origin}`);
});
