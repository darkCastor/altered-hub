
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
  experimental: {
    // Turbopack configuration
    turbo: {
      // Optimize module resolution for the game engine
      resolveAlias: {
        '@': './src',
        '~': './',
      },
      // Configure loaders for TypeScript files
      rules: {
        '*.ts': {
          loaders: ['swc-loader'],
          as: '*.js',
        },
        '*.tsx': {
          loaders: ['swc-loader'],
          as: '*.js',
        },
      },
    },
    // Enable optimizations
    optimizePackageImports: [
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      'lucide-react',
      'recharts',
    ],
  },
  // Webpack fallback for compatibility (helps with PWA plugin)
  webpack: (config, { isServer }) => {
    // Only apply webpack config for specific cases where needed
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);
