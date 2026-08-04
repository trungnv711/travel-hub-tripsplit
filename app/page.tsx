import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TripSplit — Chia chi phí chuyến đi",
  description: "Quản lý nhiều chuyến đi, chia chi phí và đối soát rõ ràng.",
};

export default function Home() {
  return (
    <main className="app-shell">
      <iframe
        className="app-frame"
        src="/tripsplit/index.html"
        title="TripSplit — Quản lý chi phí chuyến đi"
      />
    </main>
  );
}
