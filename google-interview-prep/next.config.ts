import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Prevent double-mounting effects that create duplicate WebSocket connections
};

export default nextConfig;
