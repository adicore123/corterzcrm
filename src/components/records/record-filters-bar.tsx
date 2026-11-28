"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecordFilters } from "@/lib/json-db/queries";
import {
  delayStatuses,
  devices,
  repairStatuses,
  standardStatuses,
  type Module,
} from "@/lib/validation/models";

export type QuickStatusPill = {
  id: string;
  label: string;
  count: number;
  tone: "neutral" | "red" | "amber" | "green" | "blue";
  status: string;
  delay?: string;
};

function buildFilterHref(
  baseHref: string,
  values: { q: string; status: string; delay: string; sort: string },
): string {
  const params = new URLSearchParams();
  const cleanQ = values.q.trim();
  if (cleanQ) params.set("q", cleanQ);
  if (values.status) params.set("status", values.status);
  if (values.delay) params.set("delay", values.delay);
  if (values.sort) params.set("sort", values.sort);
  const qs = params.toString();
  return qs ? `${baseHref}?${qs}` : baseHref;
}

export function RecordFiltersBar({
  module,
  href,
  searchLabel,
  filters,
  statusPills = [],
}: {
  module: Module;
  href: string;
  searchLabel: string;
  filters: RecordFilters;
  statusPills?: QuickStatusPill[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [status, setStatus] = useState(filters.status ?? "");
  const [delay, setDelay] = useState(filters.delay ?? "");
  const [sort, setSort] = useState(filters.sort ?? "");
  const debounceTimer = useRef<number | null>(null);
  const latestRef = useRef({ q, status, delay, sort });

  useEffect(() => {
    latestRef.current = { q, status, delay, sort };
  }, [q, status, delay, sort]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  function commitNavigation(next: { q: string; status: string; delay: string; sort: string }) {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const target = buildFilterHref(href, next);
    startTransition(() => {
      router.replace(target, { scroll: false });
    });
  }

  function handleQueryChange(nextQ: string) {
    setQ(nextQ);
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      commitNavigation({ ...latestRef.current, q: nextQ });
    }, 220);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitNavigation({ q, status, delay, sort });
  }

  function handleClear() {
    setQ("");
    setStatus("");
    setDelay("");
    setSort("");
    commitNavigation({ q: "", status: "", delay: "", sort: "" });
  }

  function selectQuickPill(pill: QuickStatusPill) {
    const nextStatus = pill.status;
    const nextDelay = pill.delay ?? "";
    setStatus(nextStatus);
    setDelay(nextDelay);
    commitNavigation({ q, status: nextStatus, delay: nextDelay, sort });
  }

  const filtered = Boolean(q.trim() || status || delay || sort);

  return (
    <div className="filters-shell">
      {statusPills.length > 0 && (
        <div className="status-pills-bar" role="group" aria-label="סינון מהיר בלחיצה">
          {statusPills.map((pill) => {
            const isActive =
              status === pill.status && (pill.delay !== undefined ? delay === pill.delay : delay === "");
            return (
              <button
                key={pill.id}
                type="button"
                className={`status-pill-tab tone-${pill.tone}` + (isActive ? " is-active" : "")}
                onClick={() => selectQuickPill(pill)}
              >
                <span>{pill.label}</span>
                <bdi>{pill.count}</bdi>
              </button>
            );
          })}
        </div>
      )}

      <form
        method="get"
        action={href}
        onSubmit={handleSubmit}
        className={"filters" + (isPending ? " is-filtering" : "")}
        aria-label="חיפוש וסינון"
      >
        <div className="search-field">
          <Search size={18} aria-hidden />
          <input
            type="search"
            name="q"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={q}
            onChange={(e) => handleQueryChange(e.target.value)}
            maxLength={120}
          />
          {q && (
            <button
              type="button"
              className="inline-clear-btn"
              aria-label="ניקוי טקסט חיפוש"
              onClick={() => {
                setQ("");
                commitNavigation({ ...latestRef.current, q: "" });
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {(module === "standards" || module === "repairs") && (
          <select
            name="status"
            aria-label="סינון לפי סטטוס"
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              commitNavigation({ q, status: next, delay, sort });
            }}
          >
            <option value="">כל הסטטוסים</option>
            <option value="active">כל הפעילים</option>
            {(module === "standards" ? standardStatuses : repairStatuses).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        {module === "models" && (
          <select
            name="status"
            aria-label="סינון לפי סוג מכשיר"
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              commitNavigation({ q, status: next, delay, sort });
            }}
          >
            <option value="">כל סוגי הכלים</option>
            {devices.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        {module === "faults" && (
          <select
            name="status"
            aria-label="סינון מדריכי תקלות"
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              commitNavigation({ q, status: next, delay, sort });
            }}
          >
            <option value="">הכל</option>
            <option value="has-video">כולל סרטון פתיחת הגבלה</option>
            <option value="has-files">כולל קבצים מצורפים</option>
            {devices.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        {module === "standards" && (
          <select
            name="delay"
            aria-label="סינון עיכובים"
            value={delay}
            onChange={(e) => {
              const next = e.target.value;
              setDelay(next);
              commitNavigation({ q, status, delay: next, sort });
            }}
          >
            <option value="">כל מצבי העיכוב</option>
            {delayStatuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        <select
          name="sort"
          aria-label="מיון רשומות"
          value={sort}
          onChange={(e) => {
            const next = e.target.value;
            setSort(next);
            commitNavigation({ q, status, delay, sort: next });
          }}
        >
          <option value="">{module === "models" ? "לפי שם דגם" : "עדכון אחרון"}</option>
          <option value="created">נפתחו לאחרונה</option>
          <option value="oldest">מהישן לחדש</option>
        </select>

        <Button type="submit" variant="outline">
          <ListFilter size={17} /> חיפוש
        </Button>

        {filtered && (
          <Button type="button" variant="ghost" onClick={handleClear}>
            ניקוי
          </Button>
        )}
      </form>
    </div>
  );
}
