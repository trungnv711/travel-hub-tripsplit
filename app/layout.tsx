import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Travel Hub — Không gian của tôi", template: "%s | Travel Hub" },
    description: "Không gian cá nhân cho hành trình, chi phí nhóm và những công cụ du lịch hữu ích.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Travel Hub — Không gian chuyến đi của tôi",
      description: "Hành trình, chi phí nhóm và những công cụ du lịch hữu ích.",
      images: [`${origin}/og.png`],
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
