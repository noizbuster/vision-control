/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.VC_TURBO_TEST_DISTDIR ? { distDir: process.env.VC_TURBO_TEST_DISTDIR } : {}),
};

export default nextConfig;
