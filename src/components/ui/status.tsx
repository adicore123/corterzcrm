import { CircleAlert, CircleCheck, ClipboardList, Clock3, Sparkles, XCircle } from "lucide-react";

export function Status({ value }: { value: string }) {
  const done = value === "הסתיים" || value === "סופקה" || value === "אושרה";
  const delayed = value === "מתעכב" || value === "מוכנה לאיסוף/משלוח";
  const fresh = value === "חדש" || value === "חדשה" || value === "התקבל";
  const running = value === "בטיפול" || value === "נשלחה";
  const cancelled = value === "בוטלה";
  const Icon = done
    ? CircleCheck
    : cancelled
      ? XCircle
      : delayed
        ? CircleAlert
        : fresh
          ? Sparkles
          : running
            ? Clock3
            : ClipboardList;
  const colorClass = done
    ? "status-green"
    : delayed
      ? "status-amber"
      : fresh
        ? "status-red"
        : running
          ? "status-blue"
          : "status-neutral";
  return (
    <span className={"status " + colorClass}>
      <span className="status-dot" aria-hidden="true" />
      <Icon size={13} aria-hidden /> {value}
    </span>
  );
}
