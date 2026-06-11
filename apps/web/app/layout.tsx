import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Track",
  description: "Background media acquisition workflow dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
