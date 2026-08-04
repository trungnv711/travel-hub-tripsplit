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
    title: "TripSplit — Chia chi phí chuyến đi",
    description: "Theo dõi nhiều chuyến đi, thành viên, khoản chi và quyết toán.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "TripSplit",
      description: "Chia chi phí chuyến đi rõ ràng",
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
