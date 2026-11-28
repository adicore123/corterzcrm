"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  Bike,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { labels, roleLabel } from "@/lib/presentation";
import type { PublicUser } from "@/lib/validation/models";
import { requestJson } from "@/lib/client-api";
import { Brand } from "./brand";
import { OmniSearchTrigger } from "./omni-search";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { Button } from "./ui/button";
import { ToastProvider } from "./ui/toast";

const navigationGroups = [
  {
    groupLabel: "מבט על ומכירות",
    items: [
      ["dashboard", LayoutDashboard],
      ["orders", PackagePlus],
      ["quotes", FileText],
      ["catalog", Sparkles],
    ],
  },
  {
    groupLabel: "מעבדה ותקינה",
    items: [
      ["repairs", Wrench],
      ["standards", ClipboardList],
      ["faults", ShieldAlert],
    ],
  },
  {
    groupLabel: "לקוחות וניהול",
    items: [
      ["customers", Users],
      ["models", Bike],
      ["settings", Settings],
    ],
  },
] as const;

type NavKey = (typeof navigationGroups)[number]["items"][number][0];

const navigation: ReadonlyArray<readonly [NavKey, LucideIcon]> = [
  ...navigationGroups[0].items,
  ...navigationGroups[1].items,
  ...navigationGroups[2].items,
];

export type NavBadgeCounts = {
  orders: number;
  repairs: number;
  standards: number;
  quotes?: number;
};

export function Shell({
  user,
  today,
  badgeCounts = { orders: 0, repairs: 0, standards: 0, quotes: 0 },
  children,
}: {
  user: PublicUser;
  today: string;
  badgeCounts?: NavBadgeCounts;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [navTarget, setNavTarget] = useState<{ key: NavKey; fromPath: string } | null>(null);
  const pathname = usePathname();
  const initialPathRef = useRef(pathname);
  const router = useRouter();
  const current = navigation.find(([key]) => pathname.startsWith("/" + key))?.[0] ?? "dashboard";
  const activeKey: NavKey = navTarget && navTarget.fromPath === pathname ? navTarget.key : current;
  const isAgent = user.role === "agent";
  const isEditorScreen = pathname.endsWith("/new") || pathname.endsWith("/edit");

  // Pre-warm full dynamic payloads for all primary modules
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    const fullPrefetchOpt = {
      kind: "full" as NonNullable<Parameters<typeof router.prefetch>[1]>["kind"],
    };

    const priorityRoutes =
      user.role === "agent"
        ? ["/orders", "/quotes", "/catalog", "/faults", "/dashboard"]
        : ["/dashboard", "/orders", "/repairs", "/standards", "/customers", "/models", "/faults", "/quotes"];

    const timers: number[] = [];
    const bootTimer = window.setTimeout(() => {
      const schedule =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback.bind(window)
          : (cb: () => void) => window.setTimeout(cb, 1);

      schedule(() => {
        priorityRoutes.forEach((href, idx) => {
          if (initialPathRef.current === href) return;
          const t = window.setTimeout(() => {
            router.prefetch(href, fullPrefetchOpt);
          }, idx * 55);
          timers.push(t);
        });
      });
    }, 120);

    return () => {
      window.clearTimeout(bootTimer);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [user.role, router]);

  async function signOut() {
    const event = new Event("cortez:leave", { cancelable: true });
    if (!window.dispatchEvent(event)) return;
    setSigningOut(true);
    setError("");
    try {
      await requestJson("/api/auth/logout", "POST");
      window.location.replace(new URL("/login", window.location.href));
    } catch (error) {
      setError((error as Error).message);
      setSigningOut(false);
    }
  }

  const fullPrefetch = (href: string) =>
    router.prefetch(href, {
      kind: "full" as NonNullable<Parameters<typeof router.prefetch>[1]>["kind"],
    });

  function badgeForKey(key: NavKey): { count: number; tone: "red" | "amber" | "blue" } | null {
    if (key === "orders" && badgeCounts.orders > 0) {
      return { count: badgeCounts.orders, tone: isAgent ? "blue" : "red" };
    }
    if (key === "repairs" && badgeCounts.repairs > 0) {
      return { count: badgeCounts.repairs, tone: "blue" };
    }
    if (key === "standards" && badgeCounts.standards > 0) {
      return { count: badgeCounts.standards, tone: "amber" };
    }
    if (key === "quotes" && (badgeCounts.quotes ?? 0) > 0) {
      return { count: badgeCounts.quotes ?? 0, tone: "blue" };
    }
    return null;
  }

  function sideContent(inDrawer: boolean) {
    const compact = !inDrawer && collapsed;
    return (
      <>
        <div className="sidebar-brand">
          <Link
            href="/dashboard"
            prefetch={true}
            aria-label="קורטז · סקירה כללית"
            onClick={(event) => {
              if (!event.defaultPrevented) {
                setNavTarget({ key: "dashboard", fromPath: pathname });
                setDrawer(false);
              }
            }}
          >
            <Brand compact={compact} />
          </Link>
          {inDrawer && (
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="סגירת תפריט">
                <X size={22} />
              </Button>
            </Dialog.Close>
          )}
        </div>
        <nav className="side-nav" aria-label="ניווט ראשי">
          {navigationGroups.map((group) => (
            <div className="side-nav-group" key={group.groupLabel}>
              {!compact && (
                <span className="side-nav-group-label" aria-hidden="true">
                  {group.groupLabel}
                </span>
              )}
              {group.items.map(([key, Icon]) => {
                const href = "/" + key;
                const badge = badgeForKey(key);
                return (
                  <Link
                    href={href}
                    key={key}
                    prefetch={key !== "settings"}
                    aria-label={labels[key]}
                    onPointerEnter={() => fullPrefetch(href)}
                    onTouchStart={() => fullPrefetch(href)}
                    onClick={(event) => {
                      if (!event.defaultPrevented) {
                        setNavTarget({ key, fromPath: pathname });
                        setDrawer(false);
                      }
                    }}
                    aria-current={activeKey === key ? "page" : undefined}
                    title={compact ? labels[key] : undefined}
                  >
                    <Icon size={19} aria-hidden />
                    <span className={compact ? "sr-only" : "side-nav-label"}>{labels[key]}</span>
                    {badge && !compact && (
                      <span
                        className={`side-nav-badge is-${badge.tone}`}
                        aria-hidden="true"
                        title={
                          key === "standards"
                            ? `${badge.count} בעיכוב`
                            : key === "orders"
                              ? `${badge.count} הזמנות`
                              : `${badge.count} פעילים`
                        }
                      >
                        {badge.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-footer">
          <Link
            className="profile"
            href="/settings"
            prefetch={false}
            onPointerEnter={() => fullPrefetch("/settings")}
            onTouchStart={() => fullPrefetch("/settings")}
            onClick={(event) => {
              if (!event.defaultPrevented) {
                setNavTarget({ key: "settings", fromPath: pathname });
                setDrawer(false);
              }
            }}
            title={compact ? user.name : undefined}
          >
            <span className="avatar" aria-hidden>
              {Array.from(user.name.trim())[0]?.toLocaleUpperCase()}
            </span>
            <span className={compact ? "sr-only" : "profile-text"}>
              <strong>{user.name}</strong>
              <small>{roleLabel[user.role]}</small>
            </span>
          </Link>
          <Button
            className="signout"
            onClick={signOut}
            disabled={signingOut}
            variant="ghost"
            title={compact ? "התנתקות" : undefined}
          >
            <LogOut size={17} aria-hidden />
            <span className={compact ? "sr-only" : undefined}>
              {signingOut ? "מתנתק…" : "התנתקות"}
            </span>
          </Button>
          {error && (
            <p className="side-error" role="alert">
              {error} <button onClick={() => router.refresh()}>רענון</button>
            </p>
          )}
        </div>
      </>
    );
  }

  const quickCreateActions = isAgent
    ? [
        {
          label: "הזמנה חדשה",
          desc: "פתיחת הזמנת סוכן מהירה ושליחה למורן",
          href: "/orders?new=1",
          icon: PackagePlus,
          tone: "red",
        },
        {
          label: "הצעת מחיר ללקוח",
          desc: "הפקת הצעה ממותגת ושליחה בוואטסאפ",
          href: "/quotes?new=1",
          icon: FileText,
          tone: "blue",
        },
        {
          label: "מדריך תקלות חדש",
          desc: "תיעוד פתיחת הגבלה או תקלה נפוצה",
          href: "/faults/new",
          icon: ShieldAlert,
          tone: "amber",
        },
      ]
    : [
        {
          label: "פתיחת תיקון במעבדה",
          desc: "קליטת כלי לתיקון עם לקוח ותמונות",
          href: "/repairs/new",
          icon: Wrench,
          tone: "red",
        },
        {
          label: "הזמנה חדשה",
          desc: "יצירת הזמנה חדשה במערכת",
          href: "/orders?new=1",
          icon: PackagePlus,
          tone: "blue",
        },
        {
          label: "הצעת מחיר ללקוח",
          desc: "הפקת הצעת מחיר ממותגת ושליחה בוואטסאפ",
          href: "/quotes?new=1",
          icon: FileText,
          tone: "green",
        },
        {
          label: "לקוח חדש",
          desc: "הוספת חנות או לקוח פרטי למאגר",
          href: "/customers/new",
          icon: UserRoundPlus,
          tone: "amber",
        },
        {
          label: "תיק מכון תקנים",
          desc: "פתיחת תיק תקינה חדש עם רשימת משימות",
          href: "/standards/new",
          icon: ClipboardList,
          tone: "blue",
        },
      ];

  return (
    <ToastProvider>
      <div className={"app-shell" + (collapsed ? " is-collapsed" : "") + (isEditorScreen ? " is-editor-screen" : "")}>
        <aside className="sidebar">{sideContent(false)}</aside>
        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="sidebar sidebar-mobile" dir="rtl">
              <Dialog.Title className="sr-only">תפריט ניווט</Dialog.Title>
              <Dialog.Description className="sr-only">ניווט בין מסכי המערכת</Dialog.Description>
              {sideContent(true)}
            </Dialog.Content>
          </Dialog.Portal>
          <div className="workspace">
            <header className="topbar">
              <div className="topbar-start">
                <Dialog.Trigger asChild>
                  <Button
                    className="mobile-menu"
                    size="icon"
                    variant="ghost"
                    aria-label="פתיחת תפריט"
                  >
                    <Menu size={22} />
                  </Button>
                </Dialog.Trigger>
                <Button
                  className="collapse-menu"
                  size="icon"
                  variant="ghost"
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? "הרחבת סרגל ניווט" : "כיווץ סרגל ניווט"}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? <PanelRightOpen size={19} /> : <PanelRightClose size={19} />}
                </Button>
                <span className="topbar-title">{labels[activeKey]}</span>
                {user.role === "agent" && (
                  <span className="status status-blue topbar-role-pill">
                    ממשק סוכן · קטלוג והצעות מחיר
                  </span>
                )}
              </div>

              <div className="topbar-end">
                <OmniSearchTrigger userRole={user.role} />
                <span className="top-date">
                  <CalendarDays size={16} aria-hidden />
                  {today}
                </span>
              </div>
            </header>
            <PwaInstallPrompt />
            <main id="main" className="main-content">
              {children}
            </main>
          </div>
        </Dialog.Root>

        {!isEditorScreen && (
          <nav className="mobile-bottom-nav no-print" aria-label="ניווט מהיר בנייד">
            {isAgent ? (
              <>
                <Link
                  href="/orders"
                  prefetch={true}
                  aria-label="ניווט תחתון: הזמנות"
                  className={"mobile-tab-item" + (activeKey === "orders" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "orders", fromPath: pathname })}
                >
                  <span className="mobile-tab-icon-wrap">
                    <PackagePlus size={20} aria-hidden />
                    {badgeCounts.orders > 0 && (
                      <span className="mobile-tab-badge" aria-hidden="true">
                        {badgeCounts.orders}
                      </span>
                    )}
                  </span>
                  <span>הזמנות</span>
                </Link>
                <Link
                  href="/quotes"
                  prefetch={true}
                  aria-label="ניווט תחתון: הצעות מחיר"
                  className={"mobile-tab-item" + (activeKey === "quotes" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "quotes", fromPath: pathname })}
                >
                  <span className="mobile-tab-icon-wrap">
                    <FileText size={20} aria-hidden />
                    {(badgeCounts.quotes ?? 0) > 0 && (
                      <span className="mobile-tab-badge is-blue" aria-hidden="true">
                        {badgeCounts.quotes}
                      </span>
                    )}
                  </span>
                  <span>הצעות</span>
                </Link>
                <button
                  type="button"
                  className="mobile-tab-fab"
                  aria-label="פתיחת יצירה מהירה"
                  onClick={() => setQuickOpen(true)}
                >
                  <span className="mobile-tab-fab-circle" aria-hidden>
                    <Plus size={22} strokeWidth={2.5} />
                  </span>
                  <span>חדש</span>
                </button>
                <Link
                  href="/catalog"
                  prefetch={true}
                  aria-label="ניווט תחתון: קטלוג סוכנים"
                  className={"mobile-tab-item" + (activeKey === "catalog" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "catalog", fromPath: pathname })}
                >
                  <Sparkles size={20} aria-hidden />
                  <span>קטלוג</span>
                </Link>
                <Link
                  href="/faults"
                  prefetch={true}
                  aria-label="ניווט תחתון: תקלות"
                  className={"mobile-tab-item" + (activeKey === "faults" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "faults", fromPath: pathname })}
                >
                  <ShieldAlert size={20} aria-hidden />
                  <span>תקלות</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  prefetch={true}
                  aria-label="ניווט תחתון: סקירה כללית"
                  className={"mobile-tab-item" + (activeKey === "dashboard" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "dashboard", fromPath: pathname })}
                >
                  <LayoutDashboard size={20} aria-hidden />
                  <span>בית</span>
                </Link>
                <Link
                  href="/repairs"
                  prefetch={true}
                  aria-label="ניווט תחתון: תיקונים"
                  className={"mobile-tab-item" + (activeKey === "repairs" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "repairs", fromPath: pathname })}
                >
                  <span className="mobile-tab-icon-wrap">
                    <Wrench size={20} aria-hidden />
                    {badgeCounts.repairs > 0 && (
                      <span className="mobile-tab-badge is-blue" aria-hidden="true">
                        {badgeCounts.repairs}
                      </span>
                    )}
                  </span>
                  <span>תיקונים</span>
                </Link>
                <button
                  type="button"
                  className="mobile-tab-fab"
                  aria-label="פתיחת יצירה מהירה"
                  onClick={() => setQuickOpen(true)}
                >
                  <span className="mobile-tab-fab-circle" aria-hidden>
                    <Plus size={22} strokeWidth={2.5} />
                  </span>
                  <span>חדש</span>
                </button>
                <Link
                  href="/orders"
                  prefetch={true}
                  aria-label="ניווט תחתון: הזמנות"
                  className={"mobile-tab-item" + (activeKey === "orders" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "orders", fromPath: pathname })}
                >
                  <span className="mobile-tab-icon-wrap">
                    <PackagePlus size={20} aria-hidden />
                    {badgeCounts.orders > 0 && (
                      <span className="mobile-tab-badge" aria-hidden="true">
                        {badgeCounts.orders}
                      </span>
                    )}
                  </span>
                  <span>הזמנות</span>
                </Link>
                <Link
                  href="/quotes"
                  prefetch={true}
                  aria-label="ניווט תחתון: הצעות מחיר"
                  className={"mobile-tab-item" + (activeKey === "quotes" ? " is-active" : "")}
                  onClick={() => setNavTarget({ key: "quotes", fromPath: pathname })}
                >
                  <span className="mobile-tab-icon-wrap">
                    <FileText size={20} aria-hidden />
                    {(badgeCounts.quotes ?? 0) > 0 && (
                      <span className="mobile-tab-badge is-blue" aria-hidden="true">
                        {badgeCounts.quotes}
                      </span>
                    )}
                  </span>
                  <span>הצעות</span>
                </Link>
              </>
            )}
          </nav>
        )}

        <Dialog.Root open={quickOpen} onOpenChange={setQuickOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="quick-create-sheet" dir="rtl">
              <div className="dialog-heading">
                <Dialog.Title asChild>
                  <h2>פעולה מהירה</h2>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button size="icon" variant="ghost" aria-label="סגירת פעולה מהירה">
                    <X size={20} />
                  </Button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="muted">
                בחרו מה תרצו לפתוח עכשיו בלחיצה אחת:
              </Dialog.Description>
              <div className="quick-sheet-grid">
                {quickCreateActions.map(({ label, desc, href, icon: Icon, tone }) => (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    className="quick-sheet-card"
                    onClick={() => setQuickOpen(false)}
                  >
                    <span className={`quick-sheet-icon tone-${tone}`} aria-hidden>
                      <Icon size={21} />
                    </span>
                    <span className="quick-sheet-copy">
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </ToastProvider>
  );
}
