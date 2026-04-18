/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['firebase'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
