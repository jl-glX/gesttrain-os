import { FormEvent, useCallback, useEffect, useState } from "react";
import { Database, FileClock, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface RetentionPolicy {
  id: string;
  name: string;
  jurisdiction: string;
  dataCategory: string;
  retentionDays: number | null;
  legalBasisReference: string;
  status: "draft" | "active" | "retired";
  version: number;
}

interface RetentionOverview {
  policies: RetentionPolicy[];
  records: Array<{ id: string; status: string }>;
  executionEnabled: false;
}

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await authFetch(`/api/admin/data-retention${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export function DataRetentionPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [dataCategory, setDataCategory] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const [legalBasisReference, setLegalBasisReference] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setOverview(await request<RetentionOverview>());
  }, []);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [load]);

  const createDraft = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request<{ policy: RetentionPolicy }>("/policies", {
        method: "POST",
        body: JSON.stringify({
          name,
          jurisdiction,
          dataCategory,
          retentionDays,
          legalBasisReference,
        }),
      });
      setName("");
      setJurisdiction("");
      setDataCategory("");
      setRetentionDays("");
      setLegalBasisReference("");
      setNotice(t("dataRetention.created"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            {t("dataRetention.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
            {t("dataRetention.title")}
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            {t("dataRetention.description")}
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {t("dataRetention.safetyNotice")}
        </div>

        {(error || notice) && (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error || notice}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <FileClock className="text-blue-700" />
            <h2 className="mt-4 text-xl font-black text-slate-950">
              {t("dataRetention.createTitle")}
            </h2>
            <form className="mt-5 space-y-4" onSubmit={createDraft}>
              <div>
                <Label htmlFor="policy-name">{t("dataRetention.name")}</Label>
                <Input
                  id="policy-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="policy-jurisdiction">
                    {t("dataRetention.jurisdiction")}
                  </Label>
                  <Input
                    id="policy-jurisdiction"
                    required
                    maxLength={32}
                    placeholder="ES"
                    value={jurisdiction}
                    onChange={(event) => setJurisdiction(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="policy-category">
                    {t("dataRetention.category")}
                  </Label>
                  <Input
                    id="policy-category"
                    required
                    maxLength={80}
                    value={dataCategory}
                    onChange={(event) => setDataCategory(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="policy-days">{t("dataRetention.days")}</Label>
                <Input
                  id="policy-days"
                  type="number"
                  min={1}
                  max={36500}
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="policy-basis">{t("dataRetention.basis")}</Label>
                <Input
                  id="policy-basis"
                  maxLength={255}
                  value={legalBasisReference}
                  onChange={(event) =>
                    setLegalBasisReference(event.target.value)
                  }
                />
              </div>
              <Button disabled={busy} type="submit">
                <Plus size={17} />
                {t("dataRetention.create")}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <Database className="text-blue-700" />
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {t("dataRetention.policiesTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t("dataRetention.recordCount", {
                    count: overview?.records.length ?? 0,
                  })}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {t("dataRetention.executionDisabled")}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {overview?.policies.length ? (
                overview.policies.map((policy) => (
                  <article
                    key={policy.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {policy.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {policy.jurisdiction} · {policy.dataCategory}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        {t(`dataRetention.status.${policy.status}`)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {policy.retentionDays
                        ? t("dataRetention.durationValue", {
                            count: policy.retentionDays,
                          })
                        : t("dataRetention.durationPending")}
                    </p>
                    {policy.legalBasisReference && (
                      <p className="mt-1 text-xs text-slate-500">
                        {policy.legalBasisReference}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  {t("dataRetention.empty")}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
