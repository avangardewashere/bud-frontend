import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up and finds a stray
  // package-lock.json in the home directory and infers the wrong root.
  turbopack: { root: __dirname },

  // Tech-Information.md §10 rule 8: both apps ship as containers, even while the
  // web app could run on Vercel. Keeps the exit door open.
  output: "standalone",
};

export default nextConfig;
