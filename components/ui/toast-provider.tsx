"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toneMeta: Record<
  ToastTone,
  { icon: LucideIcon; className: string; role: "status" | "alert" }
> = {
  success: {
    icon: CheckCircle2,
    className: "border-brand/25 bg-brand-soft text-brand",
    role: "status",
  },
  error: {
    icon: XCircle,
    className: "border-danger/25 bg-danger-soft text-danger",
    role: "alert",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber/25 bg-amber-soft text-amber",
    role: "status",
  },
  info: {
    icon: Info,
    className: "border-line-strong bg-surface text-ink-2",
    role: "status",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = counter.current;
      const item: ToastItem = {
        ...options,
        id,
        tone: options.tone ?? "info",
      };
      setToasts((current) => [...current.slice(-3), item]);
      const timer = setTimeout(() => dismiss(id), options.durationMs ?? 5500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  React.useEffect(() => {
    const timerMap = timers.current;
    return () => {
      for (const timer of timerMap.values()) clearTimeout(timer);
      timerMap.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,24rem)] flex-col gap-2"
      >
        {toasts.map((item) => {
          const meta = toneMeta[item.tone];
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              role={meta.role}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-raised animate-fade-up",
                meta.className,
              )}
            >
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-5">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-xs leading-5 opacity-85">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                <X aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Dismiss notification</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
