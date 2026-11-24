import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CORTEZ — מערכת תפעול וקטלוג",
    short_name: "CORTEZ",
    description: "מערכת התפעול, המעבדה, התקינה וקטלוג הסוכנים של קורטז",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "he",
    background_color: "#090b0f",
    theme_color: "#bf1619",
    icons: [
      {
        src: "/icons/cortez-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/cortez-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/cortez-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/cortez-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
