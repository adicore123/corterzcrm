"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  Bike, CalendarDays, ClipboardList, LayoutDashboard, LogOut, Menu, PackagePlus, PanelRightClose,
  PanelRightOpen, Settings, ShieldAlert, Sparkles, Users, Wrench, X, FileText,
} from "lucide-react";
import { labels, roleLabel } from "@/lib/presentation";
import type { PublicUser } from "@/lib/validation/models";
import { requestJson } from "@/lib/client-api";
import { Brand } from "./brand";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { Button } from "./ui/button";
import { ToastProvider } from "./ui/toast";

const navigation = [
  ["dashboard", LayoutDashboard], ["orders", PackagePlus], ["standards", ClipboardList], ["repairs", Wrench],
  ["customers", Users], ["models", Bike], ["faults", ShieldAlert], ["catalog", Sparkles], ["quotes", FileText], ["settings", Settings],
] as const;

export function Shell({ user, today, children }: { user: PublicUser; today: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const initialPathRef = useRef(pathname);
  const router = useRouter();
  const current = navigation.find(([key]) => pathname.startsWith("/" + key))?.[0] ?? "dashboard";

  // Quietly pre-warm primary modules during browser idle time so sidebar clicks open in 0ms
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    const priorityRoutes =
      user.role === "agent"
        ? ["/orders", "/quotes", "/catalog", "/faults"]
        : ["/dashboard", "/orders", "/repairs", "/standards", "/customers", "/faults"];

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
            router.prefetch(href);
          }, idx * 90);
          timers.push(t);
        });
      });
    }, 350);

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
      // Drop private router cache entries as soon as the session ends.
      window.location.replace(new URL("/login", window.location.href));
    } catch (error) {
      setError((error as Error).message);
      setSigningOut(false);
    }
  }

  function sideContent(inDrawer: boolean) {
    const compact = !inDrawer && collapsed;
    return <>
      <div className="sidebar-brand">
        <Link href="/dashboard" aria-label="קורטז · סקירה כללית" onClick={() => setDrawer(false)}><Brand compact={compact} /></Link>
        {inDrawer && <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="סגירת תפריט"><X size={22} /></Button></Dialog.Close>}
      </div>
      <nav className="side-nav" aria-label="ניווט ראשי">
        {navigation.map(([key, Icon]) => {
          const href = "/" + key;
          return <Link href={href} key={key} prefetch={false}
            onPointerEnter={() => router.prefetch(href)}
            onTouchStart={() => router.prefetch(href)}
            onClick={(event) => { if (!event.defaultPrevented) setDrawer(false); }}
            aria-current={current === key ? "page" : undefined} title={compact ? labels[key] : undefined}>
            <Icon size={19} aria-hidden /><span className={compact ? "sr-only" : undefined}>{labels[key]}</span>
          </Link>;
        })}
      </nav>
      <div className="side-footer">
        <Link className="profile" href="/settings" onClick={() => setDrawer(false)} title={compact ? user.name : undefined}>
          <span className="avatar" aria-hidden>{Array.from(user.name.trim())[0]?.toLocaleUpperCase()}</span>
          <span className={compact ? "sr-only" : "profile-text"}><strong>{user.name}</strong><small>{roleLabel[user.role]}</small></span>
        </Link>
        <Button className="signout" onClick={signOut} disabled={signingOut} variant="ghost" title={compact ? "התנתקות" : undefined}>
          <LogOut size={17} aria-hidden /><span className={compact ? "sr-only" : undefined}>{signingOut ? "מתנתק…" : "התנתקות"}</span>
        </Button>
        {error && <p className="side-error" role="alert">{error} <button onClick={() => router.refresh()}>רענון</button></p>}
      </div>
    </>;
  }

  return (
    <ToastProvider>
      <div className={"app-shell" + (collapsed ? " is-collapsed" : "")}>
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
              <div className="flex items-center gap-3">
                <Dialog.Trigger asChild><Button className="mobile-menu" size="icon" variant="ghost" aria-label="פתיחת תפריט"><Menu size={22} /></Button></Dialog.Trigger>
                <Button className="collapse-menu" size="icon" variant="ghost" onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? "הרחבת סרגל ניווט" : "כיווץ סרגל ניווט"} aria-expanded={!collapsed}>
                  {collapsed ? <PanelRightOpen size={19} /> : <PanelRightClose size={19} />}
                </Button>
                <span>{labels[current]}</span>
                {user.role === "agent" && <span className="status status-blue">ממשק סוכן · קטלוג והצעות מחיר</span>}
              </div>
              <span className="top-date"><CalendarDays size={16} aria-hidden />{today}</span>
            </header>
            <PwaInstallPrompt />
            <main id="main" className="main-content">{children}</main>
          </div>
        </Dialog.Root>
      </div>
    </ToastProvider>
  );
}
