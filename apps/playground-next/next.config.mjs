import { withVisionControlSourceMarkers } from "@vision-control/next-react";

const nextConfig = withVisionControlSourceMarkers(
  {
    reactStrictMode: true,
    ...(process.env.VC_TURBO_TEST_DISTDIR ? { distDir: process.env.VC_TURBO_TEST_DISTDIR } : {}),
  },
  {
    include: ["**/*.{jsx,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
);

export default nextConfig;
