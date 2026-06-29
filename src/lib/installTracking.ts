const KEYS = {
  sessions:    "bv_sessions",
  games:       "bv_games",
  dismissedAt: "bv_install_dismissed_at",
} as const;

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_FLAG = "bv_session_active";

export function trackSession() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SESSION_FLAG)) return;
  sessionStorage.setItem(SESSION_FLAG, "1");
  const count = parseInt(localStorage.getItem(KEYS.sessions) ?? "0") + 1;
  localStorage.setItem(KEYS.sessions, String(count));
}

export function trackGamesImported(count: number) {
  if (typeof window === "undefined") return;
  const current = parseInt(localStorage.getItem(KEYS.games) ?? "0");
  localStorage.setItem(KEYS.games, String(current + count));
}

export function shouldShowPrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return false;

  const dismissedAt = localStorage.getItem(KEYS.dismissedAt);
  if (dismissedAt && Date.now() - parseInt(dismissedAt) < DISMISS_COOLDOWN_MS) return false;

  const sessions = parseInt(localStorage.getItem(KEYS.sessions) ?? "0");
  const games    = parseInt(localStorage.getItem(KEYS.games)    ?? "0");

  return sessions >= 2 || games >= 5;
}

export function dismissPrompt() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.dismissedAt, String(Date.now()));
}
