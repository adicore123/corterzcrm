"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { usernameSchema } from "@/lib/validation/models";

const schema = z.object({ username: usernameSchema, password: z.string().min(1, "יש להזין סיסמה.").max(128, "הסיסמה ארוכה מדי.") });

export function LoginForm() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema), defaultValues: { username: "", password: "" },
  });
  const busy = isSubmitting || redirecting;

  return <form className="login-form" noValidate onSubmit={handleSubmit(async (values) => {
    if (busy) return;
    setError("");
    try {
      await requestJson("/api/auth/login", "POST", values);
      setRedirecting(true);
      // A new document drops the pre-login router cache after the API sets the session cookie.
      window.location.replace(new URL("/dashboard", window.location.href));
    } catch (error) {
      setError((error as Error).message);
    }
  })}>
    <Field label="שם משתמש" error={errors.username?.message}>
      {(props) => <div className="input-with-icon"><UserRound size={18} aria-hidden /><input {...props}
        {...register("username")} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" /></div>}
    </Field>
    <Field label="סיסמה" error={errors.password?.message}>
      {(props) => <div className="input-with-icon"><LockKeyhole size={18} aria-hidden /><input {...props}
        {...register("password")} type={visible ? "text" : "password"} autoComplete="current-password" dir="ltr" />
        <Button variant="ghost" size="icon" onClick={() => setVisible(!visible)} aria-label={visible ? "הסתרת סיסמה" : "הצגת סיסמה"}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>}
    </Field>
    {error && <p className="error-message" role="alert">{error}</p>}
    <Button type="submit" disabled={busy} className="login-submit">
      {busy ? "מתחבר…" : "כניסה למערכת"} <ArrowLeft size={18} aria-hidden />
    </Button>
  </form>;
}
