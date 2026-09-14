/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions default to a 1MB request body, which a video upload
    // (library media, document files) blows past immediately. Raised here
    // rather than avoided -- large videos should still prefer the external
    // video_url field (see lib/media.ts), but a modest upload needs to
    // actually work.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
