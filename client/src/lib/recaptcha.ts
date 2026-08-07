export type RecaptchaAction = "login" | "signup" | "form_access" | "feedback";

type RecaptchaApi = {
  ready(callback: () => void): void;
  execute(
    siteKey: string,
    options: { action: RecaptchaAction },
  ): Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

const SCRIPT_ID = "google-recaptcha-v3-script";
const LOAD_TIMEOUT_MS = 10_000;
let loading: Promise<void> | null = null;

function siteKey(): string {
  const value = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim();
  if (!value) throw new Error("RECAPTCHA_NOT_CONFIGURED");
  return value;
}

export function loadRecaptcha(): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (loading) return loading;

  const key = siteKey();
  loading = new Promise<void>((resolve, reject) => {
    let settled = false;
    let script: HTMLScriptElement | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) {
        if (script?.parentNode) script.remove();
        loading = null;
        reject(error);
      } else {
        resolve();
      }
    };
    const ready = () => {
      if (!window.grecaptcha) {
        finish(new Error("RECAPTCHA_UNAVAILABLE"));
        return;
      }
      window.grecaptcha.ready(() => finish());
    };
    const timeout = window.setTimeout(
      () => finish(new Error("RECAPTCHA_LOAD_TIMEOUT")),
      LOAD_TIMEOUT_MS,
    );

    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      script = existing;
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener(
        "error",
        () => finish(new Error("RECAPTCHA_LOAD_FAILED")),
        { once: true },
      );
      if (window.grecaptcha) ready();
      return;
    }

    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
    script.async = true;
    script.defer = true;
    script.onload = ready;
    script.onerror = () => finish(new Error("RECAPTCHA_LOAD_FAILED"));
    document.head.appendChild(script);
  });
  return loading;
}

export async function executeRecaptcha(
  action: RecaptchaAction,
): Promise<string> {
  await loadRecaptcha();
  const api = window.grecaptcha;
  if (!api) throw new Error("RECAPTCHA_UNAVAILABLE");
  const token = await api.execute(siteKey(), { action });
  if (!token) throw new Error("RECAPTCHA_EMPTY_TOKEN");
  return token;
}
