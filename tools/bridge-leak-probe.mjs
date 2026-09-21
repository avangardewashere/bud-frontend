/**
 * Does a shell reply follow the frame when a course navigates itself away?
 *
 * This runs the real public/bridge.js against a shell that does exactly what
 * useCourseBridge does — the hello/port handshake — on two real origins, in real
 * Chromium, with the frame sandboxed the way the player sandboxes it.
 *
 * Background: replying to the frame's window handle leaks, because a WindowProxy
 * follows the browsing context across navigation. Re-checking the handle does not
 * help; the comparison is not a dependable signal. See Planning/bridge-reply-probe.mjs
 * for the four-variant demonstration. This probe guards the fix.
 *
 *   node tools/bridge-leak-probe.mjs
 *
 * Exits non-zero if the secret reaches the attacker's page, or if the control run
 * fails — a bridge that leaks nothing because it delivers nothing is not a fix.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const SHELL_PORT = 4911;
const COURSE_PORT = 4912;
const SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;
// A different host, not just a different port: the production arrangement.
const COURSE_ORIGIN = `http://127.0.0.1:${COURSE_PORT}`;
const SECRET = "LEARNER_PRIVATE_NOTES_abc123";

const bridgeSource = await readFile(
  fileURLToPath(new URL("../public/bridge.js", import.meta.url)),
  "utf8",
);

/** The shell, doing what useCourseBridge does. */
const shell = (navigate) => `<!doctype html><meta charset="utf-8"><title>shell</title>
<pre id="log"></pre>
<iframe id="frame" title="course" sandbox="allow-scripts allow-modals"
        src="${COURSE_ORIGIN}/course.html?navigate=${navigate ? 1 : 0}"></iframe>
<script>
  var log = function (m) { document.getElementById('log').textContent += m + String.fromCharCode(10); };
  var frame = document.getElementById('frame');
  var port = null;

  addEventListener('message', function (event) {
    if (event.data && event.data.probe === 'leaked') {
      log('LEAKED ' + JSON.stringify(event.data.got));
      return;
    }
    if (event.source !== frame.contentWindow) return;
    if (port) return;
    if (!event.data || event.data.v !== 1 || event.data.hello !== true) return;

    var channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = function (e) {
      var request = e.data;
      if (!request || request.v !== 1) return;
      log('request received: ' + request.method);
      // Stand in for the API round trip, during which the course navigates.
      setTimeout(function () {
        port.postMessage({ v: 1, id: request.id, result: { value: '${SECRET}' } });
        log('replied over the port');
      }, 300);
    };
    port.start();
    frame.contentWindow.postMessage({ v: 1, type: 'bud.channel' }, '*', [channel.port2]);
    log('port transferred');
  });
</script>`;

const course = `<!doctype html><meta charset="utf-8"><title>course</title>
<script src="${SHELL_ORIGIN}/bridge.js"></script>
<script>
  window.storage.get('docker-course:state').then(function (r) {
    // The legitimate path: the course that asked receives its own answer.
    parent.postMessage({ probe: 'delivered', got: r }, '${SHELL_ORIGIN}');
  }).catch(function () {});

  if (location.search.indexOf('navigate=1') !== -1) {
    setTimeout(function () { location.href = '/attacker.html'; }, 50);
  }
</script>`;

const attacker = `<!doctype html><meta charset="utf-8"><title>attacker</title>
<script>
  // Anything arriving here arrived at a document the course chose.
  addEventListener('message', function (event) {
    parent.postMessage({ probe: 'leaked', got: event.data }, '*');
  });
</script>`;

function serve(routes, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url.split("?")[0];
      const body = routes[path];
      if (body === undefined) return void res.writeHead(404).end("not found");
      const type = path.endsWith(".js") ? "text/javascript" : "text/html";
      res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
      res.end(body);
    });
    server.listen(port, () => resolve(server));
  });
}

async function run(navigate, label) {
  const shellServer = await serve(
    { "/": shell(navigate), "/index.html": shell(navigate), "/bridge.js": bridgeSource },
    SHELL_PORT,
  );
  const courseServer = await serve(
    { "/course.html": course, "/attacker.html": attacker },
    COURSE_PORT,
  );
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    const delivered = [];
    await page.exposeFunction("__probeDelivered", (data) => delivered.push(data));
    await page.addInitScript(() => {
      addEventListener("message", (event) => {
        if (event.data && event.data.probe === "delivered") {
          window.__probeDelivered(JSON.stringify(event.data.got));
        }
      });
    });

    await page.goto(`${SHELL_ORIGIN}/index.html`);
    await page.waitForTimeout(1500);

    const log = (await page.locator("#log").textContent()) ?? "";
    const leaked = log.includes("LEAKED");

    console.log(`\n── ${label} ──`);
    for (const line of log.trim().split("\n")) console.log("   " + line);
    console.log(`   reply reached the course      : ${delivered.length > 0 ? "yes" : "no"}`);
    console.log(`   secret reached attacker page  : ${leaked ? "YES" : "no"}`);

    return { leaked, delivered: delivered.length > 0 };
  } finally {
    await browser.close();
    shellServer.close();
    courseServer.close();
  }
}

const control = await run(false, "control: course stays put");
const attack = await run(true, "attack: course navigates itself away");

console.log("\n════ result ════");
console.log(`control delivered the reply : ${control.delivered ? "yes" : "NO"}`);
console.log(`attack leaked the secret    : ${attack.leaked ? "YES" : "no"}`);

if (attack.leaked) {
  console.error("\nFAIL: the reply followed the frame to a document the course chose.");
  process.exit(1);
}
if (!control.delivered) {
  console.error("\nFAIL: the control run never delivered — this proves nothing.");
  process.exit(1);
}
console.log("\nOK: replies reach the course that asked, and nothing else.");
