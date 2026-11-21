"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatabaseBackup, Plus, Users } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { formatDate, roleLabel } from "@/lib/presentation";
import { requestJson } from "@/lib/client-api";
import { roles, userInput, type PublicUser } from "@/lib/validation/models";
import { useUnsaved } from "@/components/records/use-editor";

function backupTimestamp(id: string) {
  return id.slice(0, 10) + "T" + id.slice(11, 19).replace(/-/g, ":") + "." + id.slice(20, 23) + "Z";
}

export function AdminSettings({ users, self, backups, cloud }: { users: PublicUser[]; self: string; backups: string[]; cloud: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const ignore = useRef(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof userInput>>({
    resolver: zodResolver(userInput), defaultValues: { name: "", username: "", role: "employee", password: "" },
  });
  useUnsaved(open && isDirty, ignore);

  async function run(key: string, path: string, method: string, message: string, payload?: unknown) {
    if (action) return;
    setAction(key);
    setError("");
    setNotice("");
    try {
      await requestJson(path, method, payload);
      setNotice(message);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setAction("");
    }
  }

  const submit = handleSubmit(async (value) => {
    setFormError("");
    try {
      await requestJson("/api/settings/users", "POST", value);
      setOpen(false);
      reset();
      setNotice("המשתמש נוצר.");
      router.refresh();
    } catch (error) {
      setFormError((error as Error).message);
    }
  });

  return <>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><Users size={18} /></span>משתמשים</h2>
        <Modal open={open} onOpenChange={(next) => {
          if (!next && (isSubmitting || (isDirty && !window.confirm("לסגור את הטופס בלי לשמור?")))) return;
          if (!next) { reset(); setFormError(""); }
          setOpen(next);
        }} title="משתמש חדש" description="הקצאת גישה למערכת התפעול"
          trigger={<Button variant="outline" size="sm"><Plus size={16} /> משתמש חדש</Button>}>
          <form className="dialog-form" noValidate onSubmit={submit}>
            <Field label="שם מלא" error={errors.name?.message}>{(props) => <input {...props} {...register("name")} required maxLength={120} />}</Field>
            <Field label="שם משתמש" error={errors.username?.message}>{(props) => <input {...props} {...register("username")} required dir="ltr" autoComplete="off" maxLength={80} />}</Field>
            <Field label="סיסמה" hint="לפחות 12 תווים" error={errors.password?.message}>{(props) => <input {...props} {...register("password")}
              type="password" autoComplete="new-password" dir="ltr" required maxLength={128} />}</Field>
            <Field label="הרשאה" error={errors.role?.message}>{(props) => <select {...props} {...register("role")}>
              {roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}
            </select>}</Field>
            {formError && <p className="error-message" role="alert">{formError}</p>}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "שומר…" : "יצירת משתמש"}</Button>
          </form>
        </Modal>
      </div>
      <ul className="settings-list">{users.map((user) => <li key={user.id}>
        <div><strong>{user.name}</strong><span><bdi>{user.username}</bdi> · {roleLabel[user.role]} · {user.disabled ? "מושבת" : "פעיל"}</span></div>
        {user.id !== self && <Button variant="outline" size="sm" disabled={Boolean(action)}
          onClick={() => run(user.id, "/api/settings/users", "PATCH", user.disabled ? "המשתמש הופעל." : "המשתמש הושבת.", { id: user.id, disabled: !user.disabled })}>
          {action === user.id ? "מעדכן…" : user.disabled ? "הפעלה" : "השבתה"}
        </Button>}
      </li>)}</ul>
    </section>
    <section className="card detail-card">
      <div className="section-heading"><h2><span className="section-icon"><DatabaseBackup size={18} /></span>גיבויים</h2>
        <Button variant="outline" size="sm" disabled={Boolean(action)}
          onClick={() => run("backup", "/api/settings/backups", "POST", cloud ? "הגיבוי נשמר באחסון הפרטי." : "גיבוי מלא נשמר בשרת.")}>
          <Plus size={16} /> {action === "backup" ? "מגבה…" : "יצירת גיבוי"}
        </Button>
      </div>
      <p className="muted">{cloud ? "הגיבוי שומר עותק מהנתונים וקישורים לתמונות באחסון הפרטי."
        : "הגיבוי כולל רשומות, חשבונות ותמונות ונשמר בתיקיית הגיבויים בשרת."}</p>
      {backups.length > 0 ? <ul className="settings-list">{backups.map((id) => <li key={id}>
        <div><strong>{formatDate(backupTimestamp(id), true)}</strong><span><bdi>{id}</bdi></span></div>
      </li>)}</ul> : <p className="settings-empty muted">אין גיבויים שמורים.</p>}
    </section>
  </>;
}
