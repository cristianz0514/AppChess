import { useEffect, useRef } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Shared by every custom overlay (promotion picker, result modal — three
// separate implementations existed with none of this): on open, moves focus
// into the panel and remembers what was focused before; Tab/Shift+Tab cycle
// within the panel instead of escaping to whatever's behind it; Escape and
// the eventual unmount both restore focus to the trigger element.
export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose?: () => void) {
  const ref = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = ref.current;
    const focusables = () => panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [active, onClose]);

  return ref;
}
