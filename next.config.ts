import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cloudinary-hosted media the mentor chat's media search tool pulls
    // from (see src/lib/actions/media-actions.ts) -- next/image refuses
    // to serve an external domain it isn't told about.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
