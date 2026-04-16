/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_NESTJS_URL: process.env.NEXT_PUBLIC_NESTJS_URL || 'http://localhost:4000',
    NEXT_PUBLIC_AI_SERVICE_URL: process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000',
  },
};

export default nextConfig;
