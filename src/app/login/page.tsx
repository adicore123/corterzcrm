import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/page";
import { hasAnyUsers } from "@/lib/auth/session";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "כניסה" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const isSetup = !(await hasAnyUsers());
  return (
    <main className="login-layout">
      <section className="login-brand-panel">
        <div className="track-lines" aria-hidden />
        <div className="login-brand-copy">
          <Brand />
          <div className="brand-rule" />
          <p>
            מערכת התפעול
            <br />
            של קורטז
          </p>
          <span>תקינה, תיקונים ולקוחות</span>
        </div>
      </section>
      <section className="login-workspace" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-mark-mobile">
            <Brand />
          </div>
          <h1 id="login-title">כניסה למערכת</h1>
          <p className="muted">
            {isSetup
              ? "יש ליצור חשבון מנהל בהגדרת השרת לפני הכניסה הראשונה."
              : "היכנסו עם פרטי החשבון שלכם."}
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
