import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
