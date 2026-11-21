import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, error, hint, className, children }: {
  label: string; error?: string; hint?: string; className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
}) {
  const id = useId();
  return <div className={cn("field", className)} data-invalid={Boolean(error)}>
    <label htmlFor={id}>{label}</label>
    {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error || hint ? id + "-description" : undefined })}
    {(error || hint) && <span id={id + "-description"} className={error ? "field-error" : "muted"}>{error || hint}</span>}
  </div>;
}
