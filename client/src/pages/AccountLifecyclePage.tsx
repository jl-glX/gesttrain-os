import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

interface AccountLifecycle {
  inactivityMonths: number | null;
  lastMeaningfulActivityAt: number;
  gracePeriodDays: number;
  deletionRequest: {
    id: string;
    trigger: "manual" | "inactivity";
    status: "scheduled";
    requestedAt: number;
    graceEndsAt: number;
  } | null;
}

const inactivityOptions = [6, 12, 18, 24, 36] as const;

async function lifecycleRequest(
  path = "",
  init?: RequestInit,
): Promise<AccountLifecycle> {
  const response = await authFetch(`/api/account/lifecycle${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as
    AccountLifecycle | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Request failed");
  }
  return body as AccountLifecycle;
}

export function AccountLifecyclePage() {
  const { t, i18n } = useTranslation();
  const [lifecycle, setLifecycle] = useState<AccountLifecycle | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("disabled");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await lifecycleRequest();
    setLifecycle(result);
    setSelectedPeriod(
      result.inactivityMonths === null
        ? "disabled"
        : String(result.inactivityMonths),
    );
  }, []);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [load]);

  const run = async (
    work: () => Promise<AccountLifecycle>,
    message: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      setLifecycle(result);
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const savePreference = () =>
    run(
      () =>
        lifecycleRequest("/inactivity", {
          method: "PUT",
          body: JSON.stringify({
            inactivityMonths:
              selectedPeriod === "disabled" ? null : Number(selectedPeriod),
          }),
        }),
      t("accountLifecycle.preferenceSaved"),
    );

  const scheduleDeletion = () =>
    run(
      () => lifecycleRequest("/deletion", { method: "POST" }),
      t("accountLifecycle.deletionScheduled"),
    );

  const cancelDeletion = () =>
    run(
      () => lifecycleRequest("/deletion", { method: "DELETE" }),
      t("accountLifecycle.deletionCancelled"),
    );

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(timestamp);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            {t("accountLifecycle.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
            {t("accountLifecycle.title")}
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            {t("accountLifecycle.description")}
          </p>
        </header>

        {(error || notice) && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error || notice}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <CalendarClock className="text-blue-700" />
            <h2 className="mt-4 text-xl font-black text-slate-950">
              {t("accountLifecycle.inactivityTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("accountLifecycle.inactivityDescription")}
            </p>
            <label className="mt-5 block text-sm font-semibold text-slate-800">
              {t("accountLifecycle.periodLabel")}
              <select
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="disabled">
                  {t("accountLifecycle.disabled")}
                </option>
                {inactivityOptions.map((months) => (
                  <option key={months} value={months}>
                    {t("accountLifecycle.months", { count: months })}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="mt-4"
              disabled={busy || !lifecycle}
              onClick={() => void savePreference()}
            >
              {t("common.save")}
            </Button>
            {lifecycle && (
              <p className="mt-4 text-xs leading-5 text-slate-500">
                {t("accountLifecycle.lastActivity", {
                  date: formatDate(lifecycle.lastMeaningfulActivityAt),
                })}
              </p>
            )}
          </Card>

          <Card className="p-6">
            <Trash2 className="text-red-700" />
            <h2 className="mt-4 text-xl font-black text-slate-950">
              {t("accountLifecycle.manualTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("accountLifecycle.manualDescription")}
            </p>
            {lifecycle?.deletionRequest ? (
              <>
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  {t("accountLifecycle.pendingUntil", {
                    date: formatDate(lifecycle.deletionRequest.graceEndsAt),
                  })}
                </div>
                <Button
                  variant="outline"
                  className="mt-4"
                  disabled={busy}
                  onClick={() => void cancelDeletion()}
                >
                  <RotateCcw size={17} />
                  {t("accountLifecycle.cancelDeletion")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="mt-5 border-red-200 text-red-700 hover:bg-red-50"
                disabled={busy || !lifecycle}
                onClick={() => void scheduleDeletion()}
              >
                <Trash2 size={17} />
                {t("accountLifecycle.scheduleDeletion")}
              </Button>
            )}
          </Card>
        </div>

        <p className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          {t("accountLifecycle.demoNotice")}
        </p>
      </div>
    </main>
  );
}
