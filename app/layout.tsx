import type { Metadata } from "next";
import { Noto_Sans_JP, Open_Sans } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "行政手続き検索システム",
  description: "日本の行政手続きを簡単に検索できるシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${notoSansJP.variable} ${openSans.variable} antialiased`}
        style={{ fontFamily: 'var(--font-open-sans), var(--font-noto-sans-jp), "Open Sans", "Noto Sans JP", sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
