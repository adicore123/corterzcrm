import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { authorizedUser } from "@/lib/auth/page";
import { publicUser } from "@/lib/auth/session";
import { usesBlobStorage } from "@/lib/json-db/blob-store";
import { listBackups, readCollection } from "@/lib/json-db/store";
import { roleLabel } from "@/lib/presentation";
import { DEFAULT_AGENT_INVITE_CODE, DEFAULT_PICKUP_ADDRESS } from "@/lib/validation/models";
import { AdminSettings, OwnPasswordControl } from "./settings-controls";

export const metadata: Metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const user = await authorizedUser();
  const [users, backups, activity, systemSettings] = user.role === "admin"
    ? await Promise.all([readCollection("users"), listBackups(), readCollection("activity"), readCollection("settings")])
    : [[], [], [], {}];
  const recentActivity = [...activity].reverse().slice(0, 25);

  return <div className="page-stack">
    <div className="page-title"><h1>הגדרות</h1><p>{user.role === "admin" ? "חשבונות משתמשים, גיבויים ויומן פעילות" : "פרטי החשבון והרשאות"}</p></div>
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><ShieldCheck size={18} /></span>החשבון שלי</h2>
        <OwnPasswordControl />
      </div>
      <dl className="details-grid">
        <div><dt>שם מלא</dt><dd>{user.name}</dd></div>
        <div><dt>שם משתמש</dt><dd><bdi dir="ltr">{user.username}</bdi></dd></div>
        <div><dt>הרשאה</dt><dd>{roleLabel[user.role]}</dd></div>
      </dl>
    </section>
    {user.role === "admin" && <AdminSettings users={users.map(publicUser)} self={user.id} backups={backups}
      activity={recentActivity} cloud={usesBlobStorage()} hasCustomDeletePassword={Boolean(systemSettings.deletePasswordHash)}
      pickupAddress={systemSettings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS}
      agentInviteCode={systemSettings.agentInviteToken ?? DEFAULT_AGENT_INVITE_CODE} />}
  </div>;
}
