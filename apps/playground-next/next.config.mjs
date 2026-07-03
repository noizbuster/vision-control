import { withVisionControlSourceMarkers } from "@vision-control/next-react";

const nextConfig = withVisionControlSourceMarkers(
  {
    reactStrictMode: true,
  },
  {
    include: ["**/*.{jsx,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
);

export default nextConfig;
