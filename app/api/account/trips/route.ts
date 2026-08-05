import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sharedTrips } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Vui lòng đăng nhập để xem các chuyến đi đã lưu." }, { status: 401 });
  }

  const records = await getDb()
    .select({
      shareId: sharedTrips.shareId,
      revision: sharedTrips.revision,
      updatedAt: sharedTrips.updatedAt,
      tripData: sharedTrips.tripData,
    })
    .from(sharedTrips)
    .where(eq(sharedTrips.ownerId, user.userId))
    .orderBy(desc(sharedTrips.updatedAt))
    .limit(100);

  const trips = records.flatMap((record) => {
    try {
      return [{
        ...JSON.parse(record.tripData),
        shareId: record.shareId,
        shareRevision: record.revision,
        serverUpdatedAt: record.updatedAt,
      }];
    } catch {
      return [];
    }
  });

  return Response.json({ trips });
}
