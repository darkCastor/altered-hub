
import type {NextConfig} from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // Exclude files from precaching that are handled by other caching strategies
  // For example, API routes or large media files if you have specific strategies for them.
  // precacheExcludes: [/\/api\//], // Example
  // runtimeCaching: [ // You can add custom runtime caching strategies here if needed
  //   {
  //     urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
  //     handler: 'CacheFirst',
  //     options: {
  //       cacheName: 'google-fonts',
  //       expiration: {
  //         maxEntries: 4,
  //         maxAgeSeconds: 365 * 24 * 60 * 60, // 365 days
  //       },
  //     },
  //   },
  // ],
});

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'altered-prod-eu.s3.amazonaws.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default withPWA(nextConfig);
