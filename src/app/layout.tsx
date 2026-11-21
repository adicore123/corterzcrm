import type { Metadata } from "next";
import "@fontsource-variable/heebo";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "קורטז | מערכת תפעול", template: "%s | קורטז" },
  description: "מערכת תפעול לתיקי תקינה, תיקונים ולקוחות",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
