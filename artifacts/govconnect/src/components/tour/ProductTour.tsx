import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export const GUEST_EMAIL = "gast@letshare4gov.nl";
const TOUR_SEEN_KEY = "letshare4gov:tour-seen";
const START_TOUR_EVENT = "letshare4gov:start-tour";

/** Start (of herstart) de producttour vanaf elke plek in de app. */
export function startProductTour() {
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
}

type TourStep = {
  /** i18n-sleutel binnen de "tour"-namespace: steps.<key>.title / .body */
  key: string;
  /** CSS-selector van het element dat uitgelicht wordt; zonder selector is de stap gecentreerd. */
  selector?: string;
};

const STEPS: TourStep[] = [
  { key: "welcome" },
  { key: "navigation", selector: '[data-tour="nav"]' },
  { key: "content", selector: '[data-tour="content"]' },
  { key: "language", selector: '[data-tour="language"]' },
  { key: "notifications", selector: '[data-tour="notifications"]' },
  { key: "finish" },
];

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector: string | undefined): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function ProductTour({ user }: { user: User }) {
  const { t } = useTranslation("tour");
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const finish = useCallback(() => {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
    setActive(false);
    setStep(0);
    previousFocusRef.current?.focus?.();
    previousFocusRef.current = null;
  }, []);

  // Autostart voor een vers gast-account; herstart via custom event.
  useEffect(() => {
    if (user.email === GUEST_EMAIL && !localStorage.getItem(TOUR_SEEN_KEY)) {
      setStep(0);
      setActive(true);
    }
  }, [user.email]);

  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, []);

  // Meet het doel-element opnieuw bij elke stap en bij resize/scroll.
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => setRect(measure(STEPS[step]?.selector));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  // Focusbeheer: onthoud de vorige focus, focus de kaart en houd Tab binnen de dialoog.
  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    // Focus de primaire knop bij elke stap.
    cardRef.current
      ?.querySelector<HTMLElement>("[data-tour-primary]")
      ?.focus();
  }, [active, step]);

  // Escape sluit de tour; Tab blijft binnen de kaart.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finish();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = Array.from(
        card.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      if (!current || !card.contains(current)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;
  const pad = 8;

  // Kaartpositie: naast het uitgelichte element, anders gecentreerd.
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + pad + 220 < window.innerHeight;
    const top = below
      ? rect.top + rect.height + pad
      : Math.max(pad, rect.top - 220 - pad);
    const left = Math.min(
      Math.max(pad, rect.left),
      Math.max(pad, window.innerWidth - 380 - pad),
    );
    cardStyle = { position: "fixed", top, left, width: "min(380px, calc(100vw - 16px))" };
  } else {
    cardStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(420px, calc(100vw - 16px))",
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t("aria")}>
      {/* Donkere overlay met uitsparing rond het doel-element */}
      {rect ? (
        <div
          className="fixed rounded-lg ring-2 ring-primary transition-all duration-300"
          style={{
            top: rect.top - pad / 2,
            left: rect.left - pad / 2,
            width: rect.width + pad,
            height: rect.height + pad,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/65" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className="rounded-xl border bg-card text-card-foreground shadow-2xl p-5 outline-none"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold leading-tight">
            {t(`steps.${current.key}.title`)}
          </h2>
          <button
            onClick={finish}
            aria-label={t("close")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
          {t(`steps.${current.key}.body`)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>
              {t("skip")}
            </Button>
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                {t("back")}
              </Button>
            )}
            <Button size="sm" data-tour-primary onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
              {isLast ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
