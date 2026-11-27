"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";

export function ProgressiveTableSlices({
  thead,
  initialTableRows,
  extraTablePages,
  initialMobileItems,
  extraMobilePages,
  total,
  pageSize,
}: {
  thead: ReactNode;
  initialTableRows: ReactNode;
  extraTablePages: ReactNode[];
  initialMobileItems: ReactNode;
  extraMobilePages: ReactNode[];
  total: number;
  pageSize: number;
}) {
  const [shownPages, setShownPages] = useState(0);
  const visibleCount = Math.min(total, pageSize * (1 + shownPages));
  const hasMore = shownPages < extraTablePages.length;

  return (
    <>
      <div className="table-scroll">
        <table className="data-table">
          {thead}
          <tbody>
            {initialTableRows}
            {extraTablePages.slice(0, shownPages)}
          </tbody>
        </table>
      </div>
      <ul className="mobile-records">
        {initialMobileItems}
        {extraMobilePages.slice(0, shownPages)}
      </ul>
      {hasMore && (
        <div className="load-more-bar no-print">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShownPages((p) => p + 1)}
          >
            <ChevronDown size={16} /> הצג עוד רשומות (מוצגות {visibleCount} מתוך {total})
          </Button>
        </div>
      )}
    </>
  );
}
