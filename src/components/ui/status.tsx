import { CircleAlert, CircleCheck, ClipboardList, Clock3 } from "lucide-react";

export function Status({ value }: { value: string }) {
  const done = value === "הסתיים";
  const delayed = value === "מתעכב";
  const running = value === "בטיפול";
  const Icon = done ? CircleCheck : delayed ? CircleAlert : running ? Clock3 : ClipboardList;
  return <span className={"status " + (done ? "status-green" : delayed ? "status-amber" : running ? "status-blue" : "status-neutral")}>
    <Icon size={13} aria-hidden /> {value}
  </span>;
}
