import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home dir otherwise makes
  // Next infer the wrong root and warn at build time.
  turbopack: {
    root: __dirname,
  },
};

export default withNextIntl(nextConfig);
