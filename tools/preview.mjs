/**
 * `npm run preview -- <dir> [--port 3100] [--json]`
 *
 * An author's course package, in the real shell, on the real two origins.
 *
 * Why this lives in the shell repo and not in the authoring CLI: three of the four
 * things authors asked to see are questions about how the *shell* renders their
 * package — whether a Markdown table survives, what happens to a second `# Heading`,
 * whether raw HTML is escaped. Those are answered by `Outline.tsx` and `Markdown.tsx`,
 * and a preview that rendered them elsewhere would be answering about itself. The
 * player route goes further: it mounts the real `CoursePlayer`, the real
 * `useCourseBridge` and the real `public/bridge.js`, so there is no second
 * implementation of the bridge host anywhere — the thing the original decision
 * refused.
 *
 * Two listeners, because one would be wrong rather than merely weaker:
 *
 *   localhost:<port>      the shell (next dev), serving /bridge.js and /preview/*
 *   127.0.0.1:<port+1>    the course package, under its real /{id}/{version}/ shape
 *
 * Collapse them and `script-src ${courses} ${app}` and `frame-ancestors ${app}`
 * become one origin twice, so the real course CSP could not be reused — and the API's
 * own boot guard refuses a deployment shaped that way, which would make preview the
 * one arrangement in the project that cannot be deployed.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Imported, never retyped: one constant per repo is the achievable half of "no
// second copy of the sandbox flags", and preview must not add a fifth.
import { COURSE_SANDBOX_FLAGS } from "../src/lib/course/sandbox.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

function usage(message) {
  console.error(`${message}\n\nUsage: npm run preview -- <course-dir> [--port 3100] [--json]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let dir = null;
let port = 3100;
let jsonOnly = false;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--json") jsonOnly = true;
  else if (arg === "--port") {
    port = Number(argv[(i += 1)]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) usage(`Not a port: ${argv[i]}`);
  } else if (arg.startsWith("-")) usage(`Unknown option: ${arg}`);
  else if (dir === null) dir = resolve(arg);
  else usage("Give one course directory.");
}

if (dir === null) usage("Which course directory?");

const coursesPort = port + 1;
const SHELL = `http://localhost:${port}`;
const COURSES = `http://127.0.0.1:${coursesPort}`;

// Read the manifest here too, so a bad package fails before two servers start
// rather than as a page the author has to open to discover.
let manifest;
try {
  manifest = JSON.parse(await readFile(join(dir, "bud.manifest.json"), "utf8"));
} catch (cause) {
  usage(`Can't read ${join(dir, "bud.manifest.json")}: ${cause.message}`);
}
if (!manifest?.id || !manifest?.version || !Array.isArray(manifest?.sessions)) {
  usage("bud.manifest.json needs an id, a version and a sessions array.");
}

const env = {
  ...process.env,
  BUD_PREVIEW_DIR: dir,
  NEXT_PUBLIC_APP_ORIGIN: SHELL,
  NEXT_PUBLIC_COURSES_ORIGIN: COURSES,
  APP_ORIGIN: SHELL,
  COURSES_ORIGIN: COURSES,
  COURSES_PORT: String(coursesPort),
  COURSES_SINGLE_DIR: dir,
  COURSES_SINGLE_ID: manifest.id,
  COURSES_SINGLE_VERSION: manifest.version,
};

/** Child stdout is noise unless something goes wrong; --json callers get neither. */
const quiet = jsonOnly;
const children = [];

/**
 * No `shell: true`, on any platform. Node's own path contains a space on Windows
 * ("C:\Program Files
odejs
ode.exe"), and a shell splits it at the space unless
 * every argument is quoted by hand. Both children are started by invoking their
 * JavaScript entry point with this same node binary, which needs no shell and behaves
 * identically everywhere.
 */
function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: REPO,
    env,
    stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit",
  });

  /**
   * Keep the child's own words. In --json mode its output is suppressed so the one
   * line of JSON is the only thing on stdout — which also meant that when a child
   * failed, the reason vanished and this printed a guess instead.
   *
   * It guessed "port in use", which was wrong: Next refuses to start a second dev
   * server **in the same directory whatever port it is given**, and says so clearly.
   * Replacing its explanation with a worse one is the failure this file should least
   * commit, so now the child's output is repeated and nothing is asserted about why.
   */
  let said = "";
  child.stderr?.on("data", (chunk) => {
    said += chunk;
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`
${label} could not start (exit ${code}).`);
      if (said.trim()) console.error(said.trimEnd());
      console.error(
        `
Two things stop it most often: another \`next dev\` already running in this
` +
          `folder (Next refuses a second one on any port), and ${
            label === "courses" ? COURSES : SHELL
          } already
being in use. --port moves both listeners.
`,
      );
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

start("courses", process.execPath, [join(REPO, "tools", "courses-server.mjs")]);
start("shell", process.execPath, [
  join(REPO, "node_modules", "next", "dist", "bin", "next"),
  "dev",
  "-p",
  String(port),
]);

/**
 * Both listeners down, then exit — SIGTERM means stop, not stop one of them.
 *
 * Measured, not assumed, and the result differs by platform. On POSIX this handler
 * runs and the process exits 0. **On Windows there is no real SIGTERM**: Node maps
 * `kill("SIGTERM")` onto TerminateProcess, so nothing below executes and the exit code
 * is `null` rather than 0. Both child listeners were still gone afterwards and no
 * orphan was left holding a port — checked by listing node processes after a forced
 * kill — so the behaviour an author depends on holds either way. Ctrl-C, which is how
 * anyone actually stops this, raises SIGINT and does run it.
 */
let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

/** Ready when the shell answers, not when the process exists. */
async function waitForShell() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SHELL}/preview`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

if (!(await waitForShell())) {
  console.error(`The shell did not answer on ${SHELL} within 90s.`);
  shutdown(1);
}

const sessions = [...manifest.sessions]
  .map((s, index) => ({ ...s, order: typeof s.order === "number" ? s.order : index + 1 }))
  .sort((a, b) => a.order - b.order)
  .map((s) => ({
    id: s.id,
    order: s.order,
    entryPath: s.entry,
    page: `${SHELL}/preview/${encodeURIComponent(s.id)}`,
    document: `${COURSES}/${encodeURIComponent(manifest.id)}/${encodeURIComponent(
      manifest.version,
    )}/${String(s.entry).split("/").map(encodeURIComponent).join("/")}`,
  }));

/**
 * One line of JSON, on stdout, once both listeners answer. A machine reading this
 * (the leak probe's second target) should not have to scrape a log or guess a port.
 */
console.log(
  JSON.stringify({
    preview: 1,
    shell: SHELL,
    courses: COURSES,
    course: { id: manifest.id, version: manifest.version },
    sandbox: COURSE_SANDBOX_FLAGS,
    sessions,
  }),
);

if (!jsonOnly) {
  console.log(`\nCourse page   ${SHELL}/preview`);
  console.log(`Sessions      ${sessions.length}`);
  console.log(`Stop          Ctrl-C\n`);
}
