import type { NextConfig } from "next";

/** Додаткові хости для HMR у dev (через кому), якщо wildcard не підходить */
const extraDevOrigins =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Мінідодаток через ngrok / тунелі — інакше Next блокує /_next/* і ламає клієнт
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    ...extraDevOrigins,
  ],
};

export default nextConfig;
