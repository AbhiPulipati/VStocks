import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Required for Prisma and Postgres in Next.js 15+
  serverExternalPackages: ['@prisma/client', 'pg'],
};

export default nextConfig;