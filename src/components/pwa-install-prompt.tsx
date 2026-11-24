"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "cortez_pwa_dismissed_v1";
const emptySubscribe = () => () => {};

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const isStandalone = useSyncExternalStore(
    emptySubscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches
      || Boolean((window.navigator as { standalone?: boolean }).standalone),
    () => false,
  );
  const wasDismissedInStorage = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return window.sessionStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setInstalledNow(true);
      setDeferredPrompt(null);
      setGuideOpen(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installedNow || isStandalone) return null;

  async function triggerInstall() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstalledNow(true);
        }
        setDeferredPrompt(null);
        return;
      } catch {
        // Fall through to manual guide
      }
    }
    setGuideOpen(true);
  }

  function dismissBanner() {
    setBannerDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  return <>
    {!bannerDismissed && !wasDismissedInStorage && (
      <div className="pwa-install-banner no-print" role="region" aria-label="התקנת אפליקציית קורטז">
        <div className="pwa-install-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/cortez-icon-192.png" alt="לוגו אפליקציית CORTEZ" className="pwa-install-logo" />
          <div className="pwa-install-copy">
            <strong>התקינו את CORTEZ כאפליקציה בטלפון</strong>
            <span>גישה מהירה מהמסך הראשי עם לוגו החברה וחוויית מסך מלא</span>
          </div>
        </div>
        <div className="pwa-install-actions">
          <Button type="button" size="sm" onClick={triggerInstall}>
            <Download size={15} aria-hidden /> התקנה כאפליקציה
          </Button>
          <button
            type="button"
            className="pwa-install-close"
            onClick={dismissBanner}
            aria-label="סגירת הצעת התקנה"
            title="סגירה"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    )}

    <Modal
      open={guideOpen}
      onOpenChange={setGuideOpen}
      title="התקנת אפליקציית CORTEZ בטלפון"
      description="הוסיפו את המערכת למסך הבית של הטלפון לגישה מהירה כאפליקציה"
    >
      <div className="pwa-guide-modal">
        <div className="pwa-guide-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/cortez-icon-192.png" alt="לוגו CORTEZ" className="pwa-guide-icon" />
          <div>
            <strong>CORTEZ · מערכת תפעול וקטלוג</strong>
            <p className="muted">האפליקציה תופיע על מסך הבית שלך עם הלוגו הרשמי של קורטז ותיפתח במסך מלא.</p>
          </div>
        </div>
        <div className="pwa-guide-steps">
          <div className="pwa-guide-card">
            <strong>באייפון (Safari)</strong>
            <ol>
              <li>לחצו על כפתור ה<strong>שיתוף</strong> <Share size={14} style={{ display: "inline", verticalAlign: "middle" }} /> בתחתית הדפדפן.</li>
              <li>גללו ובחרו ב־<strong>״הוספה למסך הבית״ (Add to Home Screen)</strong> <PlusSquare size={14} style={{ display: "inline", verticalAlign: "middle" }} />.</li>
              <li>לחצו על <strong>״הוסף״ (Add)</strong> בפינה העליונה.</li>
            </ol>
          </div>
          <div className="pwa-guide-card">
            <strong>באנדרואיד (Chrome / Samsung)</strong>
            <ol>
              <li>לחצו על תפריט שלוש הנקודות <strong>(⋮)</strong> בפינה העליונה של הדפדפן.</li>
              <li>בחרו ב־<strong>״התקנת אפליקציה״</strong> או <strong>״הוספה למסך הבית״</strong>.</li>
              <li>אשרו את ההתקנה והאפליקציה תופיע מיד על מסך הבית.</li>
            </ol>
          </div>
        </div>
        <div className="dialog-actions">
          <Button type="button" onClick={() => setGuideOpen(false)}>הבנתי, תודה</Button>
        </div>
      </div>
    </Modal>
  </>;
}
