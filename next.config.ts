import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prophetic-night/night-engine", "@prophetic-night/shared-types"],
};

export default nextConfig;
