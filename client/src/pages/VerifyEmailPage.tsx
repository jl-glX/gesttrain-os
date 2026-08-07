import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { authFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const demoCode = (location.state as { demoVerificationCode?: string } | null)
    ?.demoVerificationCode;
  const [code, setCode] = useState(demoCode ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await authFetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(t("emailVerification.invalid"));
      await refreshUser();
      navigate("/account/security");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/auth/resend-verification", {
        method: "POST",
      });
      if (!response.ok) throw new Error(t("emailVerification.resendFailed"));
      if (response.status === 204) {
        await refreshUser();
        navigate("/account/security");
        return;
      }
      const result = (await response.json()) as {
        sent: boolean;
        demoVerificationCode?: string;
      };
      if (result.demoVerificationCode) setCode(result.demoVerificationCode);
      setNotice(t("emailVerification.resent"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t("emailVerification.eyebrow")}
      title={t("emailVerification.title")}
      description={t("emailVerification.description")}
    >
      {demoCode && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t("emailVerification.demoCode", { code: demoCode })}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 text-sm text-emerald-700">{notice}</p>}
      <form onSubmit={verify} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email-code">{t("emailVerification.code")}</Label>
          <Input
            id="email-code"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <Button className="w-full" disabled={busy || !/^\d{6}$/.test(code)}>
          {busy
            ? t("emailVerification.verifying")
            : t("emailVerification.action")}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        disabled={busy || resending}
        onClick={resend}
      >
        {resending
          ? t("emailVerification.resending")
          : t("emailVerification.resend")}
      </Button>
    </AuthShell>
  );
}
