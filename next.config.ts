import type {NextConfig} from 'next';

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
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
    // Allow data URLs for displaying uploaded images before PDF generation
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
     // This is necessary if you display the base64 strings directly in next/image
     // However, for standard <img> tags or jsPDF, remotePatterns is sufficient
     // If using next/image with base64, uncomment the following:
     // domains: ['data:'], // Note: Using 'data:' might have security implications. Be cautious.
     // Instead of allowing all data URLs, it's often better to handle base64 directly in <img> tags
     // For jsPDF, it handles base64 directly, so no specific Next.js config is needed for jsPDF itself.
  },
};

export default nextConfig;
