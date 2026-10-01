/**
 * The sandbox flags a course document runs under. One copy, for this whole repo.
 *
 * `.mjs` on purpose, and it is the only reason this is not a `.ts` file: the four
 * things that need the string are two React components and two Node scripts, and
 * plain ESM is the one format both can import. TypeScript reaches it through
 * `allowJs`; `node` reaches it directly.
 *
 * There were three copies before this — the player's iframe attribute, the dev
 * courses server's CSP, and the leak probe's literal — and nothing made them agree
 * except `e2e/security.spec.ts`, which compares the two that reach a browser. The
 * probe's copy was checked by nothing at all, so a drift there would have weakened
 * the test that exists to catch drift.
 *
 * The API has its own constant, in its own repo, because there is no shared package
 * between them and the only channel is the generated OpenAPI, which carries no
 * sandbox flags. Those two constants meet at runtime in `e2e/security.spec.ts`, which
 * asserts the player's iframe attribute and the courses origin's CSP `sandbox`
 * directive match flag for flag. That test is the seam; keep it.
 *
 * Never `allow-same-origin` (the frame would get a real origin and reach the shell's
 * cookies and DOM), never `allow-popups` (an unpoliced way out that CSP does not
 * cover — `tools/bridge-leak-probe.mjs` demonstrates both routes), never
 * `allow-top-navigation`. `allow-modals` because every worksheet `confirm()`s before
 * clearing, and `allow-forms` because they post to themselves.
 */
export const COURSE_SANDBOX_FLAGS = "allow-scripts allow-forms allow-modals";
