"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Activity as ActivityIcon, Check, Copy, DatabaseBackup, Download, KeyRound, Link2, Lock, MapPin, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { formatDate, roleLabel } from "@/lib/presentation";
import { requestJson } from "@/lib/client-api";
import { deletePasswordSchema, ordersPhoneSchema, passwordSchema, pickupAddressSchema, roles, userInput, type Activity, type PublicUser } from "@/lib/validation/models";
import { useUnsaved } from "@/components/records/use-editor";

const resetPasswordSchema = z.object({ password: passwordSchema });
const changeDeletePwdSchema = z.object({
  currentPassword: z.string().trim().min(1, "יש להזין את סיסמת המחיקה הנוכחית.").max(64),
  newPassword: deletePasswordSchema,
  confirmPassword: z.string().trim().min(1, "יש לאמת את סיסמת המחיקה החדשה.").max(64),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "אימות הסיסמה אינו תואם.",
});
const ownPasswordSchema = z.object({
  currentPassword: z.string().min(1, "יש להזין את הסיסמה הנוכחית.").max(128, "הסיסמה ארוכה מדי."),
  newPassword: passwordSchema,
});
const businessSettingsSchema = z.object({
  pickupAddress: pickupAddressSchema,
  ordersWhatsappPhone: ordersPhoneSchema,
});

const actionLabels: Record<string, string> = {
  create: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
  login: "כניסה למערכת",
  "login-failed": "ניסיון כניסה שגוי",
  logout: "התנתקות",
  backup: "יצירת גיבוי",
  disable: "השבתת משתמש",
  enable: "הפעלת משתמש",
  "password-reset": "איפוס סיסמה",
  "password-change": "שינוי סיסמה",
  "delete-password-change": "שינוי סיסמת מחיקה",
  "business-settings-change": "עדכון פרטי העסק",
  "agent-invite-rotate": "רענון קישור הרשמה לסוכנים",
};

const entityLabels: Record<string, string> = {
  standards: "תיק תקינה",
  repairs: "תיקון",
  quotes: "הצעת מחיר",
  orders: "הזמנת סוכן",
  customers: "לקוח",
  models: "דגם",
  faults: "תקלות ופתיחות הגבלה",
  users: "משתמש",
  storage: "אחסון",
  settings: "הגדרות מערכת",
};

export function OwnPasswordControl() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ignore = useRef(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof ownPasswordSchema>>({
    resolver: zodResolver(ownPasswordSchema), defaultValues: { currentPassword: "", newPassword: "" },
  });
  const unsaved = useUnsaved(open && isDirty, ignore);

  const submit = handleSubmit(async (values) => {
    setError("");
    setNotice("");
    try {
      await requestJson("/api/auth/password", "POST", values);
      setOpen(false);
      reset();
      setNotice("הסיסמה שלך עודכנה בהצלחה.");
    } catch (error) {
      setError((error as Error).message);
    }
  });

  return <>
    <div className="detail-actions">
      {notice && <span className="muted" role="status">{notice}</span>}
      <Modal open={open} onOpenChange={(next) => {
        if (!next) {
          if (isSubmitting) return;
          unsaved.requestClose(() => { reset(); setError(""); setOpen(false); });
          return;
        }
        setNotice("");
        setOpen(true);
      }} title="שינוי סיסמה" description="עדכון סיסמת החשבון האישי שלך"
        trigger={<Button variant="outline" size="sm"><KeyRound size={15} /> שינוי סיסמה</Button>}>
        <form className="dialog-form" noValidate onSubmit={submit}>
          <Field label="סיסמה נוכחית" error={errors.currentPassword?.message}>
            {(props) => <input {...props} {...register("currentPassword")} type="password" autoComplete="current-password" dir="ltr" required maxLength={128} />}
          </Field>
          <Field label="סיסמה חדשה" hint="5–8 תווים פשוטים (ללא צורך באותיות גדולות או סימנים)" error={errors.newPassword?.message}>
            {(props) => <input {...props} {...register("newPassword")} type="password" autoComplete="new-password" dir="ltr" required maxLength={128} />}
          </Field>
          {error && <p className="error-message" role="alert">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "שומר…" : "עדכון סיסמה"}</Button>
        </form>
      </Modal>
    </div>
    <UnsavedDialog open={unsaved.promptOpen} onConfirm={unsaved.confirmLeave} onCancel={unsaved.cancelLeave} description={unsaved.message} />
  </>;
}

function backupTimestamp(id: string) {
  return id.slice(0, 10) + "T" + id.slice(11, 19).replace(/-/g, ":") + "." + id.slice(20, 23) + "Z";
}

export function AdminSettings({ users, self, backups, activity = [], cloud, hasCustomDeletePassword = false, pickupAddress, ordersWhatsappPhone = "+972 52-611-1443", agentInviteCode = "" }: {
  users: PublicUser[]; self: string; backups: string[]; activity?: Activity[]; cloud: boolean; hasCustomDeletePassword?: boolean; pickupAddress: string; ordersWhatsappPhone?: string; agentInviteCode?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState(agentInviteCode);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [deletePwdOpen, setDeletePwdOpen] = useState(false);
  const [deletePwdError, setDeletePwdError] = useState("");
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [resetError, setResetError] = useState("");
  const [businessError, setBusinessError] = useState("");
  const ignore = useRef(false);
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof userInput>>({
    resolver: zodResolver(userInput), defaultValues: { name: "", username: "", role: "employee", password: "" },
  });
  const passwordForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "" },
  });
  const deletePwdForm = useForm<z.infer<typeof changeDeletePwdSchema>>({
    resolver: zodResolver(changeDeletePwdSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const businessForm = useForm<z.infer<typeof businessSettingsSchema>>({
    resolver: zodResolver(businessSettingsSchema), defaultValues: { pickupAddress, ordersWhatsappPhone },
  });
  const unsaved = useUnsaved(
    (open && isDirty)
      || (Boolean(resetTarget) && passwordForm.formState.isDirty)
      || (deletePwdOpen && deletePwdForm.formState.isDirty)
      || businessForm.formState.isDirty,
    ignore,
  );

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

  const submitDeletePassword = deletePwdForm.handleSubmit(async (value) => {
    setDeletePwdError("");
    setNotice("");
    try {
      await requestJson("/api/settings/delete-password", "PATCH", {
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      setDeletePwdOpen(false);
      deletePwdForm.reset();
      setNotice("סיסמת המחיקה עודכנה בהצלחה.");
      router.refresh();
    } catch (error) {
      setDeletePwdError((error as Error).message);
    }
  });

  const submitBusinessSettings = businessForm.handleSubmit(async (value) => {
    setBusinessError("");
    setNotice("");
    try {
      await requestJson("/api/settings/business", "PATCH", value);
      businessForm.reset(value);
      setNotice("כתובת האיסוף נשמרה בהצלחה.");
      router.refresh();
    } catch (error) {
      setBusinessError((error as Error).message);
    }
  });

  return <>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><MapPin size={18} /></span>פרטי העסק</h2>
      </div>
      <p className="muted">הכתובת תצורף אוטומטית להודעת האיסוף שנשלחת ללקוח פרטי בסיום הטיפול.</p>
      <form className="settings-business-form" noValidate onSubmit={submitBusinessSettings}>
        <Field label="כתובת לאיסוף" error={businessForm.formState.errors.pickupAddress?.message}>
          {(props) => <input {...props} {...businessForm.register("pickupAddress")} required maxLength={240} autoComplete="street-address" />}
        </Field>
        <Field label="טלפון וואטסאפ לקבלת הזמנות סוכנים (מורן)" hint="הזמנות חדשות מהסוכנים יישלחו ישירות למספר זה" error={businessForm.formState.errors.ordersWhatsappPhone?.message}>
          {(props) => <input {...props} {...businessForm.register("ordersWhatsappPhone")} required dir="ltr" maxLength={32} autoComplete="tel" />}
        </Field>
        {businessError && <p className="error-message" role="alert">{businessError}</p>}
        <Button type="submit" disabled={businessForm.formState.isSubmitting || !businessForm.formState.isDirty}>
          {businessForm.formState.isSubmitting ? "שומר…" : "שמירת הגדרות העסק"}
        </Button>
      </form>
    </section>
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><Users size={18} /></span>משתמשים וסוכנים</h2>
        <div className="detail-actions">
          <Button variant="soft" size="sm" onClick={() => {
            reset({ name: "", username: "", role: "agent", password: "" });
            setValue("role", "agent");
            setFormError("");
            setOpen(true);
          }}>
            <Plus size={16} /> פתיחת סוכן חדש
          </Button>
          <Modal open={open} onOpenChange={(next) => {
            if (!next) {
              if (isSubmitting) return;
              unsaved.requestClose(() => { reset(); setFormError(""); setOpen(false); });
              return;
            }
            setOpen(true);
          }} title="משתמש חדש" description="הקצאת גישה למערכת התפעול או פתיחת חשבון סוכן"
            trigger={<Button variant="outline" size="sm"><Plus size={16} /> משתמש חדש</Button>}>
            <form className="dialog-form" noValidate onSubmit={submit}>
              <Field label="שם מלא" error={errors.name?.message}>{(props) => <input {...props} {...register("name")} required maxLength={120} />}</Field>
              <Field label="שם משתמש" error={errors.username?.message}>{(props) => <input {...props} {...register("username")} required dir="ltr" autoComplete="off" maxLength={80} />}</Field>
              <Field label="סיסמה" hint="5–8 תווים פשוטים (ללא צורך באותיות גדולות או סימנים)" error={errors.password?.message}>{(props) => <input {...props} {...register("password")}
                type="password" autoComplete="new-password" dir="ltr" required maxLength={128} />}</Field>
              <Field label="הרשאה" hint="סוכן: צפייה בלבד במערכת · העלאה ועריכה במודול תקלות ופתיחות הגבלה בלבד · ללא אפשרות מחיקה" error={errors.role?.message}>{(props) => <select {...props} {...register("role")}>
                {roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}
              </select>}</Field>
              {formError && <p className="error-message" role="alert">{formError}</p>}
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "שומר…" : "יצירת משתמש"}</Button>
            </form>
          </Modal>
        </div>
      </div>
      <div className="agent-invite-box" style={{ display: "grid", gap: "10px", padding: "14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface-muted, rgba(0,0,0,0.02))", marginBottom: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div>
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Link2 size={16} aria-hidden /> קישור הרשמה עצמית לסוכנים</strong>
            <p className="muted" style={{ margin: "2px 0 0" }}>שלחו את הקישור לסוכן כדי שיוכל להירשם בעצמו למערכת ולקבל משתמש סוכן (צפייה בלבד + עדכון תקלות ופתיחות הגבלה, ללא מחיקה).</p>
          </div>
          <div className="detail-actions">
            <Button type="button" variant="outline" size="sm" onClick={async () => {
              const url = new URL(`/register-agent?code=${encodeURIComponent(inviteCode)}`, window.location.origin).toString();
              try {
                await navigator.clipboard.writeText(url);
                setCopiedInvite(true);
                setNotice("קישור ההרשמה לסוכן הועתק ללוח.");
                window.setTimeout(() => setCopiedInvite(false), 2200);
              } catch {
                setNotice(url);
              }
            }}>
              {copiedInvite ? <Check size={15} /> : <Copy size={15} />} {copiedInvite ? "הקישור הועתק" : "העתקת קישור הרשמה לסוכן"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={Boolean(action)} onClick={async () => {
              setAction("rotate-invite");
              setError("");
              setNotice("");
              try {
                const res = await requestJson<{ token: string }>("/api/settings/agent-invite", "PATCH", {});
                setInviteCode(res.token);
                setNotice("קישור ההרשמה לסוכנים רוענן.");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setAction("");
              }
            }}>
              <RefreshCw size={15} /> החלפת קישור
            </Button>
          </div>
        </div>
        <input
          type="text"
          readOnly
          dir="ltr"
          aria-label="קישור הרשמה לסוכן"
          value={`/register-agent?code=${inviteCode}`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <div className="user-profile-cards">
        {users.map((user) => {
          const initial = Array.from(user.name.trim())[0]?.toLocaleUpperCase() || "מ";
          const roleTone =
            user.role === "admin" ? "red" : user.role === "agent" ? "blue" : "green";
          return (
            <div
              key={user.id}
              className={"user-profile-card" + (user.disabled ? " is-disabled" : "")}
            >
              <div className="user-profile-main">
                <span className={`user-profile-avatar tone-${roleTone}`} aria-hidden="true">
                  {initial}
                </span>
                <div className="user-profile-info">
                  <div className="user-profile-topline">
                    <strong>{user.name}</strong>
                    <span className={`status status-${roleTone}`}>{roleLabel[user.role]}</span>
                    <span className={"status " + (user.disabled ? "status-neutral" : "status-green")}>
                      {user.disabled ? "מושבת" : "פעיל"}
                    </span>
                  </div>
                  <small>
                    שם משתמש: <bdi dir="ltr">{user.username}</bdi>
                  </small>
                </div>
              </div>
              <div className="detail-actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(action)}
                  onClick={() => {
                    passwordForm.reset();
                    setResetError("");
                    setResetTarget(user);
                  }}
                >
                  <KeyRound size={15} /> איפוס סיסמה
                </Button>
                {user.id !== self && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(action)}
                    onClick={() =>
                      run(
                        user.id,
                        "/api/settings/users",
                        "PATCH",
                        user.disabled ? "המשתמש הופעל." : "המשתמש הושבת.",
                        { id: user.id, disabled: !user.disabled },
                      )
                    }
                  >
                    {action === user.id ? "מעדכן…" : user.disabled ? "הפעלה" : "השבתה"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={Boolean(resetTarget)} onOpenChange={(next) => {
        if (!next) {
          if (passwordForm.formState.isSubmitting) return;
          unsaved.requestClose(() => { setResetTarget(null); passwordForm.reset(); setResetError(""); });
          return;
        }
      }} title={resetTarget ? "איפוס סיסמה · " + resetTarget.name : "איפוס סיסמה"} description="הגדרת סיסמה חדשה למשתמש">
        <form className="dialog-form" noValidate onSubmit={submitPasswordReset}>
          <Field label="סיסמה חדשה" hint="5–8 תווים פשוטים (ללא צורך באותיות גדולות או סימנים)" error={passwordForm.formState.errors.password?.message}>
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
      <div className="section-heading">
        <h2><span className="section-icon"><Lock size={18} /></span>סיסמת מחיקה במערכת</h2>
        <Modal open={deletePwdOpen} onOpenChange={(next) => {
          if (!next) {
            if (deletePwdForm.formState.isSubmitting) return;
            unsaved.requestClose(() => { deletePwdForm.reset(); setDeletePwdError(""); setDeletePwdOpen(false); });
            return;
          }
          setDeletePwdError("");
          setDeletePwdOpen(true);
        }} title="שינוי סיסמת מחיקה" description="עדכון הסיסמה הנדרשת לפני כל מחיקה במערכת (רשומות, תמונות, קבצים ומשימות)"
          trigger={<Button variant="outline" size="sm"><KeyRound size={15} /> שינוי סיסמת מחיקה</Button>}>
          <form className="dialog-form" noValidate onSubmit={submitDeletePassword}>
            <Field label="סיסמת מחיקה נוכחית" error={deletePwdForm.formState.errors.currentPassword?.message}>
              {(props) => <input {...props} {...deletePwdForm.register("currentPassword")} type="password" autoComplete="off" dir="ltr" required maxLength={64} />}
            </Field>
            <Field label="סיסמת מחיקה חדשה" hint="4–64 תווים" error={deletePwdForm.formState.errors.newPassword?.message}>
              {(props) => <input {...props} {...deletePwdForm.register("newPassword")} type="password" autoComplete="new-password" dir="ltr" required maxLength={64} />}
            </Field>
            <Field label="אימות סיסמת מחיקה חדשה" error={deletePwdForm.formState.errors.confirmPassword?.message}>
              {(props) => <input {...props} {...deletePwdForm.register("confirmPassword")} type="password" autoComplete="new-password" dir="ltr" required maxLength={64} />}
            </Field>
            {deletePwdError && <p className="error-message" role="alert">{deletePwdError}</p>}
            <Button type="submit" disabled={deletePwdForm.formState.isSubmitting}>
              {deletePwdForm.formState.isSubmitting ? "שומר…" : "שמירת סיסמת מחיקה"}
            </Button>
          </form>
        </Modal>
      </div>
      <p className="muted">כל פעולת מחיקה במערכת (רשומות, תמונות, קבצים או משימות שמורות) דורשת אימות באמצעות סיסמת מחיקה.</p>
      <div className="mt-2">
        <span className={hasCustomDeletePassword ? "status status-green" : "status status-blue"}>
          <ShieldCheck size={14} aria-hidden /> {hasCustomDeletePassword ? "מוגדרת סיסמת מחיקה מותאמת אישית" : "מוגדרת סיסמת ברירת המחדל של המערכת"}
        </span>
      </div>
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
    <section className="card detail-card">
      <div className="section-heading">
        <h2><span className="section-icon"><ActivityIcon size={18} /></span>יומן פעילות אחרונה</h2>
      </div>
      {activity.length > 0 ? (
        <ul className="activity-timeline">
          {activity.map((entry) => {
            const actorUser = users.find((u) => u.id === entry.actor);
            const actorName = actorUser ? actorUser.name : "משתמש מערכת";
            const actionText = actionLabels[entry.action] ?? entry.action;
            const entityText = entityLabels[entry.entity] ?? entry.entity;
            const dotTone =
              entry.action === "delete" || entry.action === "cancel"
                ? "red"
                : entry.action === "create" || entry.action === "accept"
                  ? "green"
                  : entry.action === "backup"
                    ? "amber"
                    : "blue";
            return (
              <li key={entry.id} className="activity-timeline-item">
                <span className={`activity-timeline-dot is-${dotTone}`} aria-hidden="true" />
                <div className="activity-timeline-main">
                  <strong>
                    {actionText} · {entityText}
                  </strong>
                  <span>בוצע ע״י {actorName}</span>
                </div>
                <time className="activity-timeline-time">{formatDate(entry.at, true)}</time>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="settings-empty muted">אין פעילות מתועדת.</p>
      )}
    </section>
    <UnsavedDialog open={unsaved.promptOpen} onConfirm={unsaved.confirmLeave} onCancel={unsaved.cancelLeave} description={unsaved.message} />
  </>;
}
