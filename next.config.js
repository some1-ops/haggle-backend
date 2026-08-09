/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: '/api/v1/:path*',
      },
      {
        source: '/webhooks/:path*',
        destination: '/api/webhooks/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
