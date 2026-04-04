/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['firebase'],
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
