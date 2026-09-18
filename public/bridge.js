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
 * Origin handling, which is the subtle part:
 *
 *   The iframe is sandboxed WITHOUT allow-same-origin, so this document has an
 *   opaque origin. That means the shell cannot name our origin when it replies
 *   and must post to our window handle with "*" instead — it verifies
 *   event.source to compensate.
 *
 *   Our side has no such problem: the shell's origin is knowable, because this
 *   script is served from it. We read it off our own <script src> and use it as
 *   an explicit targetOrigin for everything we send. Never "*".
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
  var seq = 0;
  var pending = Object.create(null);

  window.addEventListener("message", function (event) {
    // Replies arrive with targetOrigin "*" (we are opaque), so the origin
    // string is our only check that this came from the shell.
    if (event.origin !== APP_ORIGIN) return;
    if (event.source !== window.parent) return;

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
  });

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
      }, TIMEOUT_MS);

      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      window.parent.postMessage({ v: 1, id: id, method: method, params: params }, APP_ORIGIN);
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
})();
