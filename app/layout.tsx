import type { Metadata } from "next";
import "./globals.css";
import GlobalDragGuard from "./components/GlobalDragGuard";

export const metadata: Metadata = {
  title: "Buyer Searching Platform by SPSCOS",
  description: "Buyer Searching Platform — 바이어 발굴 자동화 플랫폼 by SPSCOS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-[#f6f8fa] text-[#1a1f36]">
        <GlobalDragGuard />
        {children}
      </body>
    </html>
  );
}
