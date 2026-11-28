"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  ArrowLeft,
  Bike,
  ClipboardList,
  FileText,
  PackagePlus,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  UserRound,
  UserRoundPlus,
  Wrench,
  X,
} from "lucide-react";
import type { OmniSearchItem } from "@/app/api/omni-search/route";
import { phoneHref } from "@/lib/presentation";
import type { Role } from "@/lib/validation/models";

const categoryMeta: Record<
  OmniSearchItem["category"],
  { label: string; icon: typeof Wrench }
> = {
  repairs: { label: "תיקונים במעבדה", icon: Wrench },
  orders: { label: "הזמנות", icon: PackagePlus },
  customers: { label: "לקוחות", icon: UserRound },
  standards: { label: "מכון תקנים", icon: ClipboardList },
  faults: { label: "תקלות ופתיחות הגבלה", icon: ShieldAlert },
  quotes: { label: "הצעות מחיר", icon: FileText },
  models: { label: "דגמים וקטלוג", icon: Bike },
};

export function OmniSearchTrigger({ userRole }: { userRole: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OmniSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAgent = userRole === "agent";

  function openPalette() {
    setOpen(true);
    if (Date.now() - lastFetchedAt.current > 15_000) {
      setLoading(true);
      fetch("/api/omni-search")
        .then((res) => (res.ok ? (res.json() as Promise<{ items: OmniSearchItem[] }>) : null))
        .then((data) => {
          if (data?.items) {
            setItems(data.items);
            lastFetchedAt.current = Date.now();
          }
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const filtered = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase("he");
    if (!clean) return items.slice(0, 12);
    const digits = clean.replace(/\D/g, "");
    const tokens = clean.split(/\s+/).filter(Boolean);
    return items
      .filter((item) => {
        if (tokens.every((tok) => item.keywords.includes(tok))) return true;
        if (digits.length >= 3 && item.phone?.replace(/\D/g, "").includes(digits)) return true;
        return false;
      })
      .slice(0, 24);
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<OmniSearchItem["category"], OmniSearchItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function navigateTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const quickCreates = isAgent
    ? [
        { label: "הזמנה חדשה", href: "/orders?new=1", icon: PackagePlus },
        { label: "הצעת מחיר חדשה", href: "/quotes?new=1", icon: FileText },
        { label: "מדריך תקלות חדש", href: "/faults/new", icon: ShieldAlert },
      ]
    : [
        { label: "פתיחת תיקון חדש", href: "/repairs/new", icon: Wrench },
        { label: "הזמנה חדשה", href: "/orders?new=1", icon: PackagePlus },
        { label: "הצעת מחיר חדשה", href: "/quotes?new=1", icon: FileText },
        { label: "לקוח חדש", href: "/customers/new", icon: UserRoundPlus },
        { label: "תיק מכון תקנים חדש", href: "/standards/new", icon: Plus },
      ];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) openPalette();
        else setOpen(false);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="omni-trigger"
          aria-label="חיפוש מהיר בכל המערכת"
          title="חיפוש מהיר בכל המערכת (Ctrl+K)"
        >
          <Search size={16} aria-hidden />
          <span className="omni-trigger-text">חיפוש לקוח, טלפון, תיקון, הזמנה או דגם…</span>
          <kbd className="omni-kbd" aria-hidden>
            Ctrl K
          </kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="omni-dialog"
          dir="rtl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">חיפוש מהיר בכל המערכת</Dialog.Title>
          <Dialog.Description className="sr-only">
            הקלידו שם לקוח, טלפון, מספר תיקון, מספר הזמנה, מספר סידורי או קוד תקלה
          </Dialog.Description>

          <div className="omni-search-head">
            <Search size={19} className="omni-head-icon" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפשו לפי שם לקוח, טלפון, מספר תיקון / הזמנה, סידורי או קוד תקלה…"
              aria-label="הקלדת חיפוש מהיר בכל המערכת"
              className="omni-search-input"
            />
            {query ? (
              <button
                type="button"
                className="omni-clear-btn"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="ניקוי חיפוש מהיר"
              >
                <X size={16} />
              </button>
            ) : null}
            <Dialog.Close asChild>
              <button type="button" className="omni-close-pill" aria-label="סגירת חיפוש מהיר">
                סגירה
              </button>
            </Dialog.Close>
          </div>

          <div className="omni-body">
            {!query.trim() && (
              <div className="omni-quick-section">
                <span className="omni-group-title">פעולות מהירות בלחיצה</span>
                <div className="omni-quick-grid">
                  {quickCreates.map(({ label, href, icon: Icon }) => (
                    <button
                      key={href}
                      type="button"
                      className="omni-quick-chip"
                      onClick={() => navigateTo(href)}
                    >
                      <Icon size={16} aria-hidden />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && items.length === 0 ? (
              <p className="omni-empty">טוען נתונים לחיפוש מהיר…</p>
            ) : grouped.length === 0 ? (
              <div className="omni-empty">
                <strong>לא נמצאו תוצאות עבור ״{query}״</strong>
                <span>נסו לחפש לפי חלק ממספר טלפון, שם לקוח, שם דגם או מספר תיק</span>
              </div>
            ) : (
              grouped.map(([category, groupItems]) => {
                const { label, icon: CatIcon } = categoryMeta[category];
                return (
                  <div className="omni-group" key={category}>
                    <span className="omni-group-title">
                      <CatIcon size={14} aria-hidden /> {label}
                    </span>
                    <ul className="omni-list">
                      {groupItems.map((item) => (
                        <li key={item.id} className="omni-item-row">
                          <button
                            type="button"
                            className="omni-item-btn"
                            onClick={() => navigateTo(item.href)}
                          >
                            <div className="omni-item-main">
                              <strong>{item.title}</strong>
                              <small>{item.subtitle}</small>
                            </div>
                            <div className="omni-item-end">
                              {item.badge && (
                                <span className={`status status-${item.badgeTone ?? "neutral"}`}>
                                  {item.badge}
                                </span>
                              )}
                              <ArrowLeft size={15} className="omni-item-arrow" aria-hidden />
                            </div>
                          </button>
                          {item.phone && (
                            <a
                              href={phoneHref(item.phone)}
                              className="omni-call-btn"
                              aria-label={`חיוג מהיר אל ${item.phone}`}
                              title="חיוג מהיר"
                            >
                              <Phone size={15} aria-hidden />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
