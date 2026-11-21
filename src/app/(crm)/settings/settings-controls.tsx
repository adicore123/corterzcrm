"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatabaseBackup, Download, KeyRound, Plus, Users } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { formatDate, roleLabel } from "@/lib/presentation";
import { requestJson } from "@/lib/client-api";
import { passwordSchema, roles, userInput, type PublicUser } from "@/lib/validation/models";
import { useUnsaved } from "@/components/records/use-editor";

const resetPasswordSchema = z.object({ password: passwordSchema });

function backupTimestamp(id: string) {
  return id.slice(0, 10) + "T" + id.slice(11, 19).replace(/-/g, ":") + "." + id.slice(20, 23) + "Z";
}

export function AdminSettings({ users, self, backups, cloud }: { users: PublicUser[]; self: string; backups: string[]; cloud: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [resetError, setResetError] = useState("");
  const ignore = useRef(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof userInput>>({
    resolver: zodResolver(userInput), defaultValues: { name: "", username: "", role: "employee", password: "" },
  });
  const passwordForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "" },
  });
  const unsaved = useUnsaved((open && isDirty) || (Boolean(resetTarget) && passwordForm.formState.isDirty), ignore);

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

  const submitPasswordReset = passwordForm.handleSubmit(async (value) => {
    if (!resetTarget) return;
    setResetError("");
    try {
      await requestJson("/api/settings/users", "PATCH", { id: resetTarget.id, password: value.password });
      setResetTarget(null);
      passwordForm.reset();
      setNotice("הסיסמה עודכנה.");
      router.refresh();
    } catch (error) {
      setResetError((error as Error).message);
    }
  });

  return <>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><Users size={18} /></span>משתמשים</h2>
        <Modal open={open} onOpenChange={(next) => {
          if (!next) {
            if (isSubmitting) return;
            unsaved.requestClose(() => { reset(); setFormError(""); setOpen(false); });
            return;
          }
          setOpen(true);
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
        <div className="detail-actions">
          <Button variant="outline" size="sm" disabled={Boolean(action)}
            onClick={() => { passwordForm.reset(); setResetError(""); setResetTarget(user); }}>
            <KeyRound size={15} /> איפוס סיסמה
          </Button>
          {user.id !== self && <Button variant="outline" size="sm" disabled={Boolean(action)}
            onClick={() => run(user.id, "/api/settings/users", "PATCH", user.disabled ? "המשתמש הופעל." : "המשתמש הושבת.", { id: user.id, disabled: !user.disabled })}>
            {action === user.id ? "מעדכן…" : user.disabled ? "הפעלה" : "השבתה"}
          </Button>}
        </div>
      </li>)}</ul>
      <Modal open={Boolean(resetTarget)} onOpenChange={(next) => {
        if (!next) {
          if (passwordForm.formState.isSubmitting) return;
          unsaved.requestClose(() => { setResetTarget(null); passwordForm.reset(); setResetError(""); });
          return;
        }
      }} title={resetTarget ? "איפוס סיסמה · " + resetTarget.name : "איפוס סיסמה"} description="הגדרת סיסמה חדשה למשתמש">
        <form className="dialog-form" noValidate onSubmit={submitPasswordReset}>
          <Field label="סיסמה חדשה" hint="לפחות 12 תווים" error={passwordForm.formState.errors.password?.message}>
            {(props) => <input {...props} {...passwordForm.register("password")} type="password" autoComplete="new-password" dir="ltr" required maxLength={128} />}
          </Field>
          {resetError && <p className="error-message" role="alert">{resetError}</p>}
          <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
            {passwordForm.formState.isSubmitting ? "שומר…" : "שמירת סיסמה"}
          </Button>
        </form>
      </Modal>
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
        <Button variant="outline" size="sm" asChild>
          <a href={"/api/settings/backups/" + id} download={"cortez-backup-" + id + ".json"}>
            <Download size={15} /> הורדה
          </a>
        </Button>
      </li>)}</ul> : <p className="settings-empty muted">אין גיבויים שמורים.</p>}
    </section>
    <UnsavedDialog open={unsaved.promptOpen} onConfirm={unsaved.confirmLeave} onCancel={unsaved.cancelLeave} description={unsaved.message} />
  </>;
}
