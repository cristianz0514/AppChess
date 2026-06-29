"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, Home, Star, LayoutList, X } from "lucide-react";
import { trackSession, shouldShowPrompt, dismissPrompt } from "@/lib/installTracking";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const BENEFITS = [
  { icon: Zap,        label: "Carga más rápida"      },
  { icon: Home,       label: "Ícono en pantalla"      },
  { icon: Star,       label: "Experiencia de app"     },
  { icon: LayoutList, label: "Revisión de partidas"   },
];

export function InstallPrompt() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    trackSession();

    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      if (shouldShowPrompt()) {
        setTimeout(() => setVisible(true), 2500);
      }
    }

    function onInstalled() {
      setVisible(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    const prompt = promptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    promptRef.current = null;
  }

  function handleDismiss() {
    dismissPrompt();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-[5.5rem] md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:w-76 z-50 animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Instalar BlunderVision"
    >
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl">

        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold leading-snug">Instalar BlunderVision</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acceso rápido, en cualquier momento</p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 -mt-0.5 -mr-0.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-y-2 gap-x-3 mb-4">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon size={13} className="text-foreground/80 shrink-0" />
              {label}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-foreground text-background text-xs font-semibold py-2 rounded-xl hover:opacity-90 active:opacity-70 transition-opacity"
          >
            Instalar app
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 text-xs text-muted-foreground py-2 rounded-xl border border-border hover:bg-accent/50 active:bg-accent/70 transition-colors"
          >
            Ahora no
          </button>
        </div>

      </div>
    </div>
  );
}
