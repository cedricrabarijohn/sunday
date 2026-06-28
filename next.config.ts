import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home dir otherwise makes
  // Next infer the wrong root and warn at build time.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
