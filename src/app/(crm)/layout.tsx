import { authorizedUser } from "@/lib/auth/page";
import { Shell, type NavBadgeCounts } from "@/components/shell";
import { peekHotCollection, readCollection, warmAllCollectionsInBackground } from "@/lib/json-db/store";
import { usesMongoStorage } from "@/lib/json-db/mongo-client";

export const dynamic = "force-dynamic";

async function readShellBadgeCounts(userId: string, role: string): Promise<NavBadgeCounts> {
  try {
    if (usesMongoStorage()) {
      const hotOrders = peekHotCollection("orders");
      const hotRepairs = peekHotCollection("repairs");
      const hotStandards = peekHotCollection("standards");
      return {
        orders: hotOrders
          ? role === "agent"
            ? hotOrders.filter((o) => o.createdBy === userId && o.status !== "סופקה" && o.status !== "בוטלה").length
            : hotOrders.filter((o) => o.status === "חדשה").length
          : 0,
        repairs: hotRepairs && role !== "agent"
          ? hotRepairs.filter((r) => r.status !== "הסתיים").length
          : 0,
        standards: hotStandards && role !== "agent"
          ? hotStandards.filter((s) => s.delay === "מתעכב").length
          : 0,
      };
    }
    const [orders, repairs, standards] = await Promise.all([
      readCollection("orders"),
      role === "agent" ? Promise.resolve([]) : readCollection("repairs"),
      role === "agent" ? Promise.resolve([]) : readCollection("standards"),
    ]);
    return {
      orders:
        role === "agent"
          ? orders.filter((o) => o.createdBy === userId && o.status !== "סופקה" && o.status !== "בוטלה").length
          : orders.filter((o) => o.status === "חדשה").length,
      repairs: repairs.filter((r) => r.status !== "הסתיים").length,
      standards: standards.filter((s) => s.delay === "מתעכב").length,
    };
  } catch {
    return { orders: 0, repairs: 0, standards: 0 };
  }
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await authorizedUser();
  void warmAllCollectionsInBackground();
  const badgeCounts = await readShellBadgeCounts(user.id, user.role);
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format();
  return <Shell user={user} today={today} badgeCounts={badgeCounts}>{children}</Shell>;
}
