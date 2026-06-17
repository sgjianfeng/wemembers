import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产部署: 生成独立的自包含构建
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
