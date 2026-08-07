import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadRecaptcha } from "../lib/recaptcha";

export function RecaptchaGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    loadRecaptcha()
      .then(() => active && setStatus("ready"))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  if (status === "error") {
    return (
      <pre className="whitespace-pre-wrap rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {JSON.stringify(
          { error: `CAPTCHA-001: ${t("captcha.blockingError")}` },
          null,
          2,
        )}
      </pre>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
        <LoaderCircle className="mr-2 animate-spin" size={18} />
        {t("captcha.loading")}
      </div>
    );
  }

  return (
    <>
      {children}
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} /> {t("captcha.protected")}
      </p>
    </>
  );
}
