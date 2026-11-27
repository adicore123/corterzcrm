import { authorizedUser } from "@/lib/auth/page";
import { Shell } from "@/components/shell";
import { warmAllCollectionsInBackground } from "@/lib/json-db/store";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await authorizedUser();
  void warmAllCollectionsInBackground();
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format();
  return <Shell user={user} today={today}>{children}</Shell>;
}
