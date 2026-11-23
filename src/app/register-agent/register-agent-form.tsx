"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserCheck, UserRound } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { passwordSchema, usernameSchema } from "@/lib/validation/models";

const schema = z.object({
  name: z.string().trim().min(1, "יש להזין שם מלא.").max(120, "השם ארוך מדי."),
  username: usernameSchema,
  password: passwordSchema,
});

export function RegisterAgentForm({ code }: { code: string }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", username: "", password: "" },
  });
  const busy = isSubmitting || redirecting;

  return <form className="login-form" noValidate onSubmit={handleSubmit(async (values) => {
    if (busy) return;
    setError("");
    try {
      await requestJson("/api/auth/register-agent", "POST", { ...values, code });
      setRedirecting(true);
      window.location.replace(new URL("/dashboard", window.location.href));
    } catch (err) {
      setError((err as Error).message);
    }
  })}>
    <Field label="שם מלא" error={errors.name?.message}>
      {(props) => <div className="input-with-icon"><UserCheck size={18} aria-hidden /><input {...props}
        {...register("name")} autoComplete="name" maxLength={120} required placeholder="למשל רועי כהן" /></div>}
    </Field>
    <Field label="שם משתמש (באנגלית או ספרות)" error={errors.username?.message}>
      {(props) => <div className="input-with-icon"><UserRound size={18} aria-hidden /><input {...props}
        {...register("username")} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" required placeholder="agent1" /></div>}
    </Field>
    <Field label="סיסמה" hint="5–8 תווים פשוטים (ללא צורך באותיות גדולות או סימנים)" error={errors.password?.message}>
      {(props) => <div className="input-with-icon"><LockKeyhole size={18} aria-hidden /><input {...props}
        {...register("password")} type={visible ? "text" : "password"} autoComplete="new-password" dir="ltr" required placeholder="12345" />
        <Button variant="ghost" size="icon" onClick={() => setVisible(!visible)} aria-label={visible ? "הסתרת סיסמה" : "הצגת סיסמה"}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>}
    </Field>
    {error && <p className="error-message" role="alert">{error}</p>}
    <Button type="submit" disabled={busy} className="login-submit">
      {busy ? "פותח חשבון סוכן…" : "הרשמה וכניסה למערכת"} <ArrowLeft size={18} aria-hidden />
    </Button>
    <p className="muted" style={{ textAlign: "center", marginTop: "6px" }}>
      כבר יש לכם חשבון? <Link className="text-link" href="/login">כניסה למערכת</Link>
    </p>
  </form>;
}
