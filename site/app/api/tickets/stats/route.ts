import { getGiveawayDb, getGiveawayTotalCap } from "@/lib/giveaway-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getGiveawayDb();
    const row = db.prepare("SELECT COUNT(*) AS c FROM giveaway_tickets").get() as { c: number };
    const total = getGiveawayTotalCap();
    return Response.json(
      { sold: row.c, total },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    console.error("[tickets/stats]", e);
    return Response.json(
      { sold: 0, total: getGiveawayTotalCap() },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
