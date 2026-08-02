import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  FileCheck2,
  LockKeyhole,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { authFetch } from "../lib/api";

type DataCategory =
  | "account_profile"
  | "preferences"
  | "bookings"
  | "sessions"
  | "authentication_factors"
  | "delegations"
  | "billing_records"
  | "security_events";

interface DeletionReview {
  gracePeriodDays: number;
  deletionRequest: {
    id: string;
    graceEndsAt: number;
  } | null;
  dataDisposition: {
    executionEnabled: false;
    categories: Array<{
      dataCategory: DataCategory;
      defaultDisposition:
        | "delete"
        | "delete_or_anonymize"
        | "cancel_future_anonymize_history"
        | "revoke_and_delete"
        | "retain_only_if_policy_applies";
      retentionRequiresReviewedPolicy: boolean;
      reviewState: "policy_review_required" | "draft_policy" | "unclassified";
      retainedRecordCount: number;
    }>;
  };
  deletionDraft: {
    selectedCategories: DataCategory[];
    intent: "selected_data" | "account_closure";
    updatedAt: number;
  } | null;
  legalRetentionNoticeRequired: true;
  closureImpact: {
    reservationsAffected: number;
    activeSessions: number;
    delegationGrantsAffected: number;
    dataExportStatus: "planned";
    executionEnabled: false;
  };
}

async function reviewRequest(
  path = "/deletion-review",
  init?: RequestInit,
): Promise<DeletionReview> {
  const response = await authFetch(`/api/account/lifecycle${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as
    DeletionReview | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Request failed");
  }
  return body as DeletionReview;
}

export function AccountDataDeletionPage() {
  const { t, i18n } = useTranslation();
  const [review, setReview] = useState<DeletionReview | null>(null);
  const [selected, setSelected] = useState<DataCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    const result = await reviewRequest();
    setReview(result);
    setSelected(result.deletionDraft?.selectedCategories ?? []);
  }, []);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [load]);

  const toggleCategory = (category: DataCategory) => {
    setSelected((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const saveDraft = async (
    intent: "selected_data" | "account_closure",
    categories: DataCategory[],
  ) => {
    const result = await reviewRequest("/deletion-review", {
      method: "PUT",
      body: JSON.stringify({ selectedCategories: categories, intent }),
    });
    setReview(result);
    setSelected(result.deletionDraft?.selectedCategories ?? categories);
  };

  const prepareSelectedDeletion = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveDraft("selected_data", selected);
      setNotice(t("accountDataDeletion.selectionSaved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const scheduleAccountClosure = async () => {
    if (!review) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const allCategories = review.dataDisposition.categories.map(
        (category) => category.dataCategory,
      );
      await saveDraft("account_closure", allCategories);
      await reviewRequest("/deletion", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await load();
      setPassword("");
      setNotice(t("accountDataDeletion.accountScheduled"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancelAccountClosure = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await reviewRequest("/deletion", { method: "DELETE" });
      await load();
      setNotice(t("accountDataDeletion.accountCancelled"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(timestamp);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/account/lifecycle">
            <ArrowLeft size={17} />
            {t("accountDataDeletion.back")}
          </Link>
        </Button>

        <header className="mt-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-red-700">
            {t("accountDataDeletion.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
            {t("accountDataDeletion.title")}
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            {t("accountDataDeletion.description")}
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

        <Card className="mt-8 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {t("accountDataDeletion.chooseTitle")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t("accountDataDeletion.chooseDescription")}
              </p>
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
              {t("accountDataDeletion.demoMode")}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {review?.dataDisposition.categories.map((category) => (
              <label
                key={category.dataCategory}
                className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(category.dataCategory)}
                  onChange={() => toggleCategory(category.dataCategory)}
                  className="mt-1 size-4 accent-red-600"
                />
                <span>
                  <span className="block font-bold text-slate-900">
                    {t(
                      `accountLifecycle.dataCategories.${category.dataCategory}`,
                    )}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    {t(
                      `accountLifecycle.dispositions.${category.defaultDisposition}`,
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {t(`accountLifecycle.reviewStates.${category.reviewState}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Button
            className="mt-5"
            variant="outline"
            disabled={busy || selected.length === 0}
            onClick={() => void prepareSelectedDeletion()}
          >
            <FileCheck2 size={17} />
            {t("accountDataDeletion.deleteSelected")}
          </Button>
        </Card>

        <Card className="mt-6 border-amber-200 bg-amber-50 p-6">
          <CircleAlert className="text-amber-700" />
          <h2 className="mt-3 text-lg font-black text-amber-950">
            {t("accountDataDeletion.legalTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            {t("accountDataDeletion.legalDescription")}
          </p>
          <p className="mt-3 text-xs leading-5 text-amber-800">
            {t("accountDataDeletion.legalPending")}
          </p>
        </Card>

        <Card className="mt-6 p-6">
          <Trash2 className="text-red-700" />
          <h2 className="mt-3 text-xl font-black text-slate-950">
            {t("accountDataDeletion.accountTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {t("accountDataDeletion.accountDescription", {
              count: review?.gracePeriodDays ?? 30,
            })}
          </p>

          {review && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                {t("accountDataDeletion.impactBookings", {
                  count: review.closureImpact.reservationsAffected,
                })}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                {t("accountDataDeletion.impactSessions", {
                  count: review.closureImpact.activeSessions,
                })}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                {t("accountDataDeletion.impactDelegations", {
                  count: review.closureImpact.delegationGrantsAffected,
                })}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                {t("accountDataDeletion.impactDownloads")}
              </div>
            </div>
          )}

          {review?.deletionRequest ? (
            <>
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                {t("accountDataDeletion.pendingUntil", {
                  date: formatDate(review.deletionRequest.graceEndsAt),
                })}
              </div>
              <Button
                className="mt-4"
                variant="outline"
                disabled={busy}
                onClick={() => void cancelAccountClosure()}
              >
                <RotateCcw size={17} />
                {t("accountDataDeletion.cancelAccount")}
              </Button>
            </>
          ) : (
            <div className="mt-5 max-w-xl">
              <label className="block text-sm font-semibold text-slate-800">
                <span className="flex items-center gap-2">
                  <LockKeyhole size={17} />
                  {t("accountDataDeletion.passwordConfirmation")}
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                />
              </label>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {t("accountDataDeletion.reauthenticationNotice")}
              </p>
              <Button
                className="mt-4"
                variant="destructive"
                disabled={busy || !review || password.length === 0}
                onClick={() => void scheduleAccountClosure()}
              >
                <Trash2 size={17} />
                {t("accountDataDeletion.deleteAccount")}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
