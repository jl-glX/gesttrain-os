import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const DEVELOPMENT_SITE_KEY = "1x00000000000000000000AA";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          action: string;
          theme: "auto";
          size: "flexible";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
    const script = existing ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile could not be loaded"));
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

export function CaptchaWidget({
  action,
  onToken,
  resetSignal = 0,
}: {
  action: "login" | "signup";
  onToken: (token: string) => void;
  resetSignal?: number;
}) {
  const containerId = `turnstile-${useId().replaceAll(":", "")}`;
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [loadFailed, setLoadFailed] = useState(false);
  const { t } = useTranslation();
  onTokenRef.current = onToken;

  useEffect(() => {
    let disposed = false;
    const sitekey =
      import.meta.env.VITE_TURNSTILE_SITE_KEY ??
      (import.meta.env.DEV ? DEVELOPMENT_SITE_KEY : "");
    if (!sitekey) {
      setLoadFailed(true);
      onTokenRef.current("");
      return;
    }
    loadTurnstile()
      .then(() => {
        if (disposed || !window.turnstile) return;
        widgetId.current = window.turnstile.render(`#${containerId}`, {
          sitekey,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            setLoadFailed(true);
          },
        });
      })
      .catch(() => setLoadFailed(true));
    return () => {
      disposed = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
  }, [action, containerId]);

  useEffect(() => {
    if (resetSignal && widgetId.current && window.turnstile) {
      onTokenRef.current("");
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  return (
    <div className="space-y-2" aria-label={t("captcha.label")}>
      <div id={containerId} className="min-h-16 w-full" />
      {loadFailed && (
        <p role="alert" className="text-xs text-red-600">
          {t("captcha.loadFailed")}
        </p>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        {t("captcha.help")}
      </p>
    </div>
  );
}
