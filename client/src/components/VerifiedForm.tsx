import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { CaptchaWidget } from "./CaptchaWidget";

type VerifiedFormProps = ComponentProps<"form"> & {
  verificationFallback?: ReactNode;
};

export function VerifiedForm({
  children,
  verificationFallback,
  ...formProps
}: VerifiedFormProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "verified" | "required">(
    "loading",
  );
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState("");
  const [validUntil, setValidUntil] = useState(0);

  useEffect(() => {
    let active = true;
    authFetch("/api/auth/form-verification")
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        return (await response.json()) as {
          verified?: boolean;
          validUntil?: number;
        };
      })
      .then((result) => {
        if (!active) return;
        setValidUntil(result.validUntil ?? 0);
        setStatus(result.verified ? "verified" : "required");
      })
      .catch(() => {
        if (active) setStatus("required");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "verified" || validUntil <= Date.now()) return;
    const timeout = window.setTimeout(() => {
      setStatus("required");
      setValidUntil(0);
      setResetSignal((value) => value + 1);
    }, validUntil - Date.now());
    return () => window.clearTimeout(timeout);
  }, [status, validUntil]);

  const verify = async (captchaToken: string) => {
    if (!captchaToken) return;
    setError("");
    try {
      const response = await authFetch("/api/auth/form-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken }),
      });
      if (!response.ok) throw new Error("Verification failed");
      const result = (await response.json()) as { validUntil?: number };
      if (!result.validUntil || result.validUntil <= Date.now()) {
        throw new Error("Verification session is not valid");
      }
      setValidUntil(result.validUntil);
      setStatus("verified");
    } catch {
      setError(t("formVerification.error"));
      setResetSignal((value) => value + 1);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
        <LoaderCircle className="mr-2 animate-spin" size={18} />
        {t("formVerification.checking")}
      </div>
    );
  }

  if (status === "required") {
    return (
      verificationFallback ?? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-blue-700" />
            <div className="w-full">
              <h3 className="font-bold text-blue-950">
                {t("formVerification.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-blue-900">
                {t("formVerification.description")}
              </p>
              {error && (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-4">
                <CaptchaWidget
                  action="form_access"
                  onToken={(token) => void verify(token)}
                  resetSignal={resetSignal}
                />
              </div>
            </div>
          </div>
        </section>
      )
    );
  }

  return <form {...formProps}>{children}</form>;
}
