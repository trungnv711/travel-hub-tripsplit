import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sharedTrips, tripHistory } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TRIP_BYTES = 750_000;

type RouteContext = { params: Promise<{ shareId: string }> };

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getChatGPTUser();
    const { shareId } = await context.params;
    if (!SHARE_ID_PATTERN.test(shareId)) {
      return Response.json({ error: "Link chia sẻ không hợp lệ." }, { status: 400 });
    }

    const [record] = await getDb()
      .select()
      .from(sharedTrips)
      .where(eq(sharedTrips.shareId, shareId))
      .limit(1);

    if (!record) return Response.json({ error: "Không tìm thấy chuyến đi." }, { status: 404 });
    return Response.json({
      shareId: record.shareId,
      revision: record.revision,
      updatedAt: record.updatedAt,
      isOwner: Boolean(user && record.ownerId === user.userId),
      trip: JSON.parse(record.tripData),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải chuyến đi.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getChatGPTUser();
    const { shareId } = await context.params;
    if (!SHARE_ID_PATTERN.test(shareId)) {
      return Response.json({ error: "Link chia sẻ không hợp lệ." }, { status: 400 });
    }

    const payload = (await request.json()) as { trip?: unknown };
    if (!validateTrip(payload.trip)) {
      return Response.json({ error: "Dữ liệu chuyến đi không hợp lệ." }, { status: 400 });
    }

    const tripData = JSON.stringify(payload.trip);
    if (new TextEncoder().encode(tripData).length > MAX_TRIP_BYTES) {
      return Response.json({ error: "Dữ liệu chuyến đi vượt quá giới hạn cho phép." }, { status: 413 });
    }

    const [record] = await getDb()
      .update(sharedTrips)
      .set({
        tripData,
        revision: sql`${sharedTrips.revision} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sharedTrips.shareId, shareId))
      .returning({ shareId: sharedTrips.shareId, revision: sharedTrips.revision, updatedAt: sharedTrips.updatedAt });

    if (!record) return Response.json({ error: "Không tìm thấy chuyến đi." }, { status: 404 });
    await getDb().insert(tripHistory).values({
      id: crypto.randomUUID(),
      shareId,
      revision: record.revision,
      actorId: user?.userId ?? null,
      actorEmail: user?.email ?? null,
      action: "updated",
      tripData,
    });
    return Response.json({ ...record, savedToAccount: Boolean(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đồng bộ chuyến đi.";
    return Response.json({ error: message }, { status: 500 });
  }
}
