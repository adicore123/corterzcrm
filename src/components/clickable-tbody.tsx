"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ClickableTableBody({ children }: { children: ReactNode }) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLTableSectionElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest(
        "a, button, select, input, textarea, label, [role='button'], [role='dialog'], .inline-status-wrap",
      )
    ) {
      return;
    }
    const tr = target.closest("tr[data-row-href]");
    const href = tr?.getAttribute("data-row-href");
    if (href) {
      router.push(href);
    }
  }

  return <tbody onClick={handleClick}>{children}</tbody>;
}
