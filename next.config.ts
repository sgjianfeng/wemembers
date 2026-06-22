import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@vonage/server-sdk", "@vonage/messages"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
