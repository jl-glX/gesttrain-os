import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Eye,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import { authFetch } from "../lib/api";

type SecurityLevel = "low" | "medium" | "high";

interface SecurityManagerOverview {
  generatedAt: number;
  mode: "observe";
  automaticBlockingEnabled: false;
  controls: {
    captcha: {
      configured: boolean;
      execution: "manual";
      serverValidation: true;
    };
    trustedMutationOrigin: boolean;
    authenticationRateLimit: boolean;
    securityHeaders: boolean;
    riskEngine: "observe";
  };
  metrics: {
    failedLogins24h: number;
    captchaFailures24h: number;
    captchaSuccesses24h: number;
    riskObservations7d: number;
    highRiskObservations7d: number;
  };
  recentEvents: Array<{
    id: string;
    userId: string | null;
    type: string;
    createdAt: number;
    metadata: {
      action?: string;
      level?: SecurityLevel;
      reason?: string;
      surface?: string;
    };
  }>;
  coordination: {
    mode: "shared-runtime";
    managers: readonly ["account", "security", "resource"];
    activeOperations: Array<{
      id: string;
      manager: "account" | "security" | "resource";
      operation: string;
      scopes: string[];
      startedAt: number;
    }>;
    recentSignals: Array<{
      id: string;
      source: "account" | "security" | "resource";
      severity: "info" | "warning" | "critical";
      code: string;
      message: string;
      createdAt: number;
    }>;
  };
}

export function SecurityManagerPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<SecurityManagerOverview | null>(
    null,
  );
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const loadOverview = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    try {
      const response = await authFetch("/api/admin/security-manager");
      if (!response.ok) throw new Error(t("securityManager.loadError"));
      const result = (await response.json()) as SecurityManagerOverview;
      if (requestSequence.current === requestId) {
        setOverview(result);
        setError("");
      }
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("securityManager.loadError"),
        );
      }
    }
  }, [t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const metrics = overview
    ? [
        {
          label: t("securityManager.failedLogins24h"),
          value: overview.metrics.failedLogins24h,
          icon: ShieldAlert,
        },
        {
          label: t("securityManager.captchaFailures24h"),
          value: overview.metrics.captchaFailures24h,
          icon: Bot,
        },
        {
          label: t("securityManager.riskObservations7d"),
          value: overview.metrics.riskObservations7d,
          icon: Eye,
        },
        {
          label: t("securityManager.highRiskObservations7d"),
          value: overview.metrics.highRiskObservations7d,
          icon: TriangleAlert,
        },
      ]
    : [];

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto w-full max-w-[96rem]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              {t("securityManager.eyebrow")}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              {t("securityManager.title")}
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">
              {t("securityManager.description")}
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadOverview()}>
            <RefreshCw size={17} />
            {t("common.refresh")}
          </Button>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!overview ? (
          <p className="mt-10 text-slate-500">{t("common.loading")}</p>
        ) : (
          <>
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <Eye className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold">{t("securityManager.observeTitle")}</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  {t("securityManager.observeDescription")}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(({ icon: Icon, label, value }) => (
                <article
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <Icon className="text-blue-600" size={22} />
                  <p className="mt-4 text-sm font-medium text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </article>
              ))}
            </div>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold">
                    {t("securityManager.controlsTitle")}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t("securityManager.controlsDescription")}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  [
                    t("securityManager.captchaControl"),
                    overview.controls.captcha.configured,
                  ],
                  [
                    t("securityManager.originControl"),
                    overview.controls.trustedMutationOrigin,
                  ],
                  [
                    t("securityManager.rateLimitControl"),
                    overview.controls.authenticationRateLimit,
                  ],
                  [
                    t("securityManager.headersControl"),
                    overview.controls.securityHeaders,
                  ],
                  [t("securityManager.riskControl"), true],
                ].map(([label, enabled]) => (
                  <div
                    key={String(label)}
                    className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"
                  >
                    {enabled ? (
                      <CheckCircle2 className="shrink-0 text-emerald-600" />
                    ) : (
                      <TriangleAlert className="shrink-0 text-amber-600" />
                    )}
                    <div>
                      <p className="font-semibold">{label}</p>
                      <p className="text-xs text-slate-500">
                        {enabled
                          ? t("securityManager.available")
                          : t("securityManager.notConfigured")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold">
                {t("securityManager.coordinationTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                {t("securityManager.coordinationDescription", {
                  managers: overview.coordination.managers.length,
                  operations: overview.coordination.activeOperations.length,
                })}
              </p>
              {overview.coordination.recentSignals.length > 0 && (
                <div className="mt-4 space-y-2">
                  {overview.coordination.recentSignals
                    .slice(0, 5)
                    .map((signal) => (
                      <p
                        key={signal.id}
                        className="rounded-xl border border-blue-200 bg-white/70 px-4 py-3 text-sm"
                      >
                        <strong>{signal.source}</strong>: {signal.message}
                      </p>
                    ))}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <Activity className="text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold">
                    {t("securityManager.eventsTitle")}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t("securityManager.eventsDescription")}
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {overview.recentEvents.length ? (
                  overview.recentEvents.map((event) => (
                    <article
                      key={event.id}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {event.type.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {[event.metadata.surface, event.metadata.reason]
                            .filter(Boolean)
                            .join(" · ") || t("securityManager.noDetails")}
                        </p>
                      </div>
                      <time className="shrink-0 text-sm text-slate-500">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "short",
                          timeStyle: "medium",
                        }).format(event.createdAt)}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="text-slate-500">
                    {t("securityManager.noEvents")}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
