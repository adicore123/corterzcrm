"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="system-state" role="alert">
    <h1>טעינת הדף נכשלה</h1>
    <p className="muted">יש לנסות שוב. אם התקלה נמשכת, יש לפנות למנהל המערכת.</p>
    <div className="flex flex-wrap justify-center gap-2"><Button onClick={reset}>ניסיון חוזר</Button>
      <Button variant="outline" asChild><Link href="/dashboard">לסקירה הכללית</Link></Button></div>
  </section>;
}
