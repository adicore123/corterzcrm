import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/page";
import { readCollection } from "@/lib/json-db/store";
import { DEFAULT_AGENT_INVITE_CODE } from "@/lib/validation/models";
import { Brand } from "@/components/brand";
import { RegisterAgentForm } from "./register-agent-form";

export const metadata: Metadata = { title: "הרשמת סוכן למערכת" };
export const dynamic = "force-dynamic";

export default async function RegisterAgentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const query = await searchParams;
  const code = typeof query.code === "string" ? query.code.trim() : "";
  const settings = await readCollection("settings");
  const expectedCode = settings.agentInviteToken ?? DEFAULT_AGENT_INVITE_CODE;
  const validCode = Boolean(code && code === expectedCode);

  return <main className="login-layout">
    <section className="login-brand-panel">
      <div className="track-lines" aria-hidden />
      <div className="login-brand-copy">
        <Brand />
        <div className="brand-rule" />
        <p>ממשק סוכנים<br />של קורטז</p>
        <span>צפייה במערכת, תקלות נפוצות ופתיחות הגבלה</span>
      </div>
    </section>
    <section className="login-workspace" aria-labelledby="register-agent-title">
      <div className="login-card">
        <div className="login-mark-mobile"><Brand /></div>
        <h1 id="register-agent-title">הרשמת סוכן למערכת</h1>
        {validCode ? (
          <>
            <p className="muted">צרו חשבון סוכן אישי לכניסה למערכת קורטז. החשבון מאפשר צפייה בכל נתוני המערכת והעלאת תקלות נפוצות ופתיחות הגבלה.</p>
            <RegisterAgentForm code={code} />
          </>
        ) : (
          <div className="page-stack" style={{ marginTop: "12px" }}>
            <p className="error-message" role="alert">קישור ההרשמה לסוכן חסר או שהוחלף על ידי מנהל המערכת. בקשו קישור הרשמה עדכני ממנהל המערכת.</p>
            <Link className="button button-outline" href="/login">מעבר למסך הכניסה</Link>
          </div>
        )}
      </div>
    </section>
  </main>;
}
