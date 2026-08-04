import { getDb } from "../../../db";
import { sharedTrips } from "../../../db/schema";

const MAX_TRIP_BYTES = 750_000;

function validateTrip(trip: unknown): trip is Record<string, unknown> {
  if (!trip || typeof trip !== "object") return false;
  const value = trip as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Array.isArray(value.members) &&
    Array.isArray(value.expenses)
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { trip?: unknown };
    if (!validateTrip(payload.trip)) {
      return Response.json({ error: "Dữ liệu chuyến đi không hợp lệ." }, { status: 400 });
    }

    const tripData = JSON.stringify(payload.trip);
    if (new TextEncoder().encode(tripData).length > MAX_TRIP_BYTES) {
      return Response.json({ error: "Dữ liệu chuyến đi vượt quá giới hạn cho phép." }, { status: 413 });
    }

    const shareId = crypto.randomUUID();
    const [record] = await getDb()
      .insert(sharedTrips)
      .values({ shareId, tripData, revision: 1 })
      .returning({ shareId: sharedTrips.shareId, revision: sharedTrips.revision });

    return Response.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo link chia sẻ.";
    return Response.json({ error: message }, { status: 500 });
  }
}
