import type { NextConfig } from "next";

/**
 * The Content-Security-Policy is NOT set here. It needs a fresh nonce per request, so
 * it lives in src/proxy.ts, built by src/lib/security/csp.ts.
 *
 * Setting one here as well would not be a harmless duplicate: a browser given two
 * CSP headers enforces both, so a request would have to satisfy the intersection of
 * a static policy and a nonced one. Only headers that do not vary per request belong
 * in this file.
 */
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
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
