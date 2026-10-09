/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@mao/shared'],
  eslint: { ignoreDuringBuilds: true },
  // El indicador de desarrollo de Next tapaba el grupo Configuración del pie de la barra lateral.
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
