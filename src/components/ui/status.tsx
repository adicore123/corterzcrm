import { CircleAlert, CircleCheck, ClipboardList, Clock3, XCircle } from "lucide-react";

export function Status({ value }: { value: string }) {
  const done = value === "הסתיים" || value === "סופקה";
  const delayed = value === "מתעכב" || value === "מוכנה לאיסוף/משלוח";
  const running = value === "בטיפול" || value === "חדשה";
  const cancelled = value === "בוטלה";
  const Icon = done
    ? CircleCheck
    : cancelled
      ? XCircle
      : delayed
        ? CircleAlert
        : running
          ? Clock3
          : ClipboardList;
  const colorClass = done
    ? "status-green"
    : delayed
      ? "status-amber"
      : running
        ? "status-blue"
        : "status-neutral";
  return (
    <span className={"status " + colorClass}>
      <Icon size={13} aria-hidden /> {value}
    </span>
  );
}
