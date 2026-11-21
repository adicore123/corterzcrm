import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <section className="system-state">
    <h1>הדף לא נמצא</h1><p className="muted">ייתכן שהרשומה הוסרה או שהכתובת שונתה.</p>
    <Button asChild><Link href="/dashboard">לסקירה הכללית</Link></Button>
  </section>;
}
