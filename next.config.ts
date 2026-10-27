import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Ayarlardaki fiyat listesi fotoğrafları (tarayıcıda küçültülüp en fazla 5 tane).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
