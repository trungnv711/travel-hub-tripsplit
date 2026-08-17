import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TripSplit — Chia chi phí chuyến đi",
  description: "Quản lý nhiều chuyến đi, chia chi phí và đối soát rõ ràng.",
};

export default async function ToolPage({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const params = await searchParams;
  const shareId = typeof params.trip === "string" ? params.trip : "";
  const frameSource = shareId ? `/tripsplit/index.html?trip=${encodeURIComponent(shareId)}` : "/tripsplit/index.html";
  return (
    <main className="tool-shell">
      <iframe className="tool-frame" src={frameSource} title="TripSplit — Quản lý chi phí chuyến đi" />
    </main>
  );
}
