"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 4000;

type ToastProps = {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  action?: React.ReactNode;
};

type ToastState = ToastProps & {
  dismissAt?: number;
  durationMs?: number;
};

type ActionType = {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastProps["variant"];
  action?: React.ReactNode;
  duration?: number;
};

const toastTypes = {
  default: { border: "#e5e2de", progress: "#62626b" },
  destructive: { border: "#efcdca", progress: "#a41318" },
  success: { border: "#cce7d4", progress: "#168a48" },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const addToast = (action: ActionType) => {
    const id = action.id ?? Math.random().toString(36).slice(2, 9);
    const delay = action.duration ?? TOAST_REMOVE_DELAY;
    const dismissAt = Date.now() + delay;
    const toast: ToastState = {
      ...action,
      id,
      dismissAt,
      durationMs: delay,
    };
    setToasts((prev) => [toast, ...prev].slice(0, TOAST_LIMIT));
    setTimeout(() => {
      setToasts((prev) => {
        const current = prev.find((t) => t.id === id);
        if (!current || current.dismissAt !== dismissAt) return prev;
        return prev.filter((t) => t.id !== id);
      });
    }, delay);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const dismissToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissAt: 0 } : t)),
    );
    setTimeout(() => removeToast(id), 200);
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast, removeToast }}>
      {children}
      <div
        className="toast-container"
        dir="rtl"
        role="region"
        aria-label="התראות"
      >
        {toasts.map((toastItem) => {
          const isDismissing = toastItem.dismissAt === 0;
          const style = toastTypes[toastItem.variant ?? "default"];

          const variantClass =
            toastItem.variant === "success"
              ? "toast-success"
              : toastItem.variant === "destructive"
                ? "toast-error"
                : "toast-default";

          let icon: React.ReactNode;
          if (toastItem.variant === "success") {
            icon = (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            );
          } else if (toastItem.variant === "destructive") {
            icon = (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            );
          } else {
            icon = (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M12 17V21"></path>
                <path d="M12 3V7"></path>
              </svg>
            );
          }

          return (
            <div
              key={toastItem.id}
              className={cn(
                "toast",
                variantClass,
                isDismissing ? "toast-dismissing" : "toast-visible",
              )}
              style={{ borderColor: style.border }}
              role="alert"
              aria-live="polite"
            >
              <div className="toast-icon">{icon}</div>
              <div className="toast-content">
                {toastItem.title && <h4 className="toast-title">{toastItem.title}</h4>}
                {toastItem.description && (
                  <p className="toast-description">{toastItem.description}</p>
                )}
              </div>
              {toastItem.action && (
                <button
                  type="button"
                  onClick={() => dismissToast(toastItem.id)}
                  className="toast-close"
                  aria-label="סגירת התראה"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              )}
              {!isDismissing && toastItem.dismissAt && (
                <div className="toast-progress">
                  <div
                    className="toast-progress-bar"
                    style={{
                      "--toast-duration": `${toastItem.durationMs ?? TOAST_REMOVE_DELAY}ms`,
                    } as React.CSSProperties}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

const ToastContext = React.createContext<{
  toasts: ToastState[];
  addToast: (action: ActionType) => string;
  dismissToast: (id: string) => void;
  removeToast: (id: string) => void;
} | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function toastAction(action: ActionType) {
  return action.id ?? Math.random().toString(36).slice(2, 9);
}
