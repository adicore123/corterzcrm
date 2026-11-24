import type { Metadata, Viewport } from "next";
import "@fontsource-variable/heebo";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#bf1619",
};

export const metadata: Metadata = {
  title: { default: "קורטז | מערכת תפעול", template: "%s | קורטז" },
  description: "מערכת תפעול לתיקי תקינה, תיקונים ולקוחות",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CORTEZ",
  },
  icons: {
    icon: "/icons/cortez-icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
