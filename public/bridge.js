/**
 * Bud course bridge — contract v1.
 *
 * Injected into every course HTML entry by the courses origin. Runs INSIDE the
 * sandboxed iframe and gives course code two globals:
 *
 *   window.storage = { get, set, delete }   opaque per-user, per-course state
 *   window.bud     = { complete, progress, ready, height }
 *
 * The course never sees a user id, a course id, or a cookie. The shell knows
 * which course is mounted and scopes every call to the signed-in user.
 *
 * ── Why a MessageChannel rather than postMessage to window.parent ──
 *
 * Replies used to be posted back to the frame's window handle. That handle is a
 * WindowProxy, which follows the browsing context across navigation rather than
 * pointing at a document — so a course could call storage.get, navigate its own
 * frame to a page it controlled, and receive the shell's reply there. The
 * learner's saved work would land on an attacker-chosen document, defeating the
 * courses origin's connect-src 'none' by using the shell's own reply as the
 * channel. Verified in Chromium; see Planning/bridge-reply-probe.mjs.
 *
 * Checking the handle before replying does not fix it: the comparison is not a
 * dependable signal, and the probe leaks even in the run where it reports the
 * handles as different.
 *
 * A port does fix it, structurally rather than by timing. A MessagePort belongs
 * to the document that received it. After a navigation the new document never
 * had one, so there is nothing to deliver to and nothing to check.
 */
(function () {
  "use strict";

  var SELF = document.currentScript;
  var APP_ORIGIN = SELF ? new URL(SELF.src, location.href).origin : null;

  if (!APP_ORIGIN) {
    // No way to address the shell safely. Leave the globals undefined so the
    // course falls back to working in-tab, exactly as it does with no bridge.
    return;
  }

  var TIMEOUT_MS = 10000;
  /**
   * Storage calls wait much longer. On the free deploy the API sleeps, and a cold
   * start holds a request for a minute or more. A worksheet whose storage.get timed
   * out here would start from a blank sheet while the shell was still fetching the
   * learner's work — and its next save would write that blank sheet over it. The
   * shell always answers within this (STATE_LOAD_DEADLINE_MS in useCourseBridge.ts
   * is shorter), so the course never gives up before the shell does.
   */
  var STORAGE_TIMEOUT_MS = 180000;
  var seq = 0;
  var pending = Object.create(null);
  var port = null;
  var queued = [];

  window.addEventListener("message", function (event) {
    // The handshake is the only thing that arrives on the window; everything
    // else travels over the port.
    if (event.origin !== APP_ORIGIN) return;
    if (event.source !== window.parent) return;

    var msg = event.data;
    if (!msg || msg.v !== 1 || msg.type !== "bud.channel") return;

    // One port per mounted document, ever. A second handshake is either a bug
    // or an attempt to replace the channel, and neither should be honoured.
    if (port) return;
    if (!event.ports || !event.ports[0]) return;

    port = event.ports[0];
    port.onmessage = onReply;
    port.start();

    for (var i = 0; i < queued.length; i += 1) port.postMessage(queued[i]);
    queued = [];
  });

  function onReply(event) {
    var msg = event.data;
    if (!msg || msg.v !== 1 || typeof msg.id !== "number") return;

    var entry = pending[msg.id];
    if (!entry) return;
    delete pending[msg.id];
    clearTimeout(entry.timer);

    if (msg.error) {
      entry.reject(new Error(msg.error.message || msg.error.code || "bridge error"));
    } else {
      entry.resolve(msg.result);
    }
  }

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      if (window.parent === window) {
        reject(new Error("bud bridge: not framed"));
        return;
      }

      var id = ++seq;
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error("bud bridge: " + method + " timed out"));
      }, method.indexOf("storage.") === 0 ? STORAGE_TIMEOUT_MS : TIMEOUT_MS);

      pending[id] = { resolve: resolve, reject: reject, timer: timer };

      var envelope = { v: 1, id: id, method: method, params: params };
      // Calls made before the port arrives are held rather than dropped: the
      // worksheets ask for their state the moment they parse.
      if (port) port.postMessage(envelope);
      else queued.push(envelope);
    });
  }

  /**
   * storage.get resolves to { value: string | null } — the shape the Docker
   * worksheets already expect from window.storage.get(KEY).
   */
  window.storage = {
    get: function (key) {
      return call("storage.get", { key: String(key) });
    },
    set: function (key, value) {
      return call("storage.set", { key: String(key), value: String(value) });
    },
    // Present because every Docker worksheet calls it on "reset progress".
    delete: function (key) {
      return call("storage.delete", { key: String(key) });
    },
  };

  window.bud = {
    // A suggestion, not a command: the shell owns what "complete" means.
    complete: function (sessionId) {
      return call("bud.complete", { sessionId: String(sessionId) });
    },
    progress: function (sessionId, fraction) {
      return call("bud.progress", { sessionId: String(sessionId), fraction: Number(fraction) });
    },
    ready: function () {
      return call("bud.ready", {});
    },
    height: function (px) {
      return call("bud.height", { px: Number(px) });
    },
  };

  // Ask for the channel. This runs while the original course document is
  // parsing, so the first hello always comes from the page the shell mounted.
  window.parent.postMessage({ v: 1, hello: true }, APP_ORIGIN);
})();
