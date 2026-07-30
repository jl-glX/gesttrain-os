import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CreditCard,
  Download,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { ProfilePhotoSettings } from "../components/ProfilePhotoSettings";
import { DelegationManager } from "../components/DelegationManager";
import { AccountSupportIdentifier } from "../components/AccountSupportIdentifier";

interface AccountShortcut {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

function ShortcutCard({
  shortcut,
  actionLabel,
}: {
  shortcut: AccountShortcut;
  actionLabel: string;
}) {
  const Icon = shortcut.icon;

  return (
    <Link
      to={shortcut.to}
      className="group flex min-h-64 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <span className="inline-flex w-fit rounded-2xl bg-blue-50 p-3 text-blue-700">
        <Icon />
      </span>
      <h3 className="mt-4 text-lg font-bold text-slate-950">
        {shortcut.title}
      </h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">
        {shortcut.description}
      </p>
      <span className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-700">
        {actionLabel}
        <ArrowRight
          size={18}
          className="transition-transform group-hover:translate-x-1"
        />
      </span>
    </Link>
  );
}

export function AccountControlPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const personalLinks: AccountShortcut[] = [
    {
      to: "/account/security",
      icon: ShieldCheck,
      title: t("accountControl.security"),
      description: t("accountControl.securityDescription"),
    },
    {
      to: "/account/lifecycle",
      icon: Trash2,
      title: t("accountControl.lifecycle"),
      description: t("accountControl.lifecycleDescription"),
    },
    {
      to: "/downloads",
      icon: Download,
      title: t("accountControl.downloads"),
      description: t("accountControl.downloadsDescription"),
    },
  ];

  const memberLinks: AccountShortcut[] = [
    {
      to: "/my-bookings",
      icon: CalendarDays,
      title: t("accountControl.bookings"),
      description: t("accountControl.bookingsDescription"),
    },
    {
      to: "/my-payments",
      icon: ShoppingBag,
      title: t("accountControl.payments"),
      description: t("accountControl.paymentsDescription"),
    },
    {
      to: "/workout-timer",
      icon: Timer,
      title: t("accountControl.timer"),
      description: t("accountControl.timerDescription"),
    },
    {
      to: "/activity-dashboard",
      icon: BarChart3,
      title: t("accountControl.memberAnalytics"),
      description: t("accountControl.memberAnalyticsDescription"),
    },
  ];

  const trainerLinks: AccountShortcut[] = [
    {
      to: "/trainer-dashboard",
      icon: LayoutDashboard,
      title: t("accountControl.trainerDashboard"),
      description: t("accountControl.trainerDashboardDescription"),
    },
    {
      to: "/trainer-analytics",
      icon: BarChart3,
      title: t("accountControl.trainerAnalytics"),
      description: t("accountControl.trainerAnalyticsDescription"),
    },
  ];

  const adminLinks: AccountShortcut[] = [
    {
      to: "/admin-dashboard",
      icon: LayoutDashboard,
      title: t("accountControl.adminDashboard"),
      description: t("accountControl.adminDashboardDescription"),
    },
    {
      to: "/billing",
      icon: CreditCard,
      title: t("accountControl.billing"),
      description: t("accountControl.billingDescription"),
    },
    {
      to: "/admin-analytics",
      icon: BarChart3,
      title: t("accountControl.adminAnalytics"),
      description: t("accountControl.adminAnalyticsDescription"),
    },
    {
      to: "/admin/resource-manager",
      icon: Gauge,
      title: t("accountControl.resourceManager"),
      description: t("accountControl.resourceManagerDescription"),
    },
  ];

  const roleLinks =
    user?.role === "member"
      ? memberLinks
      : user?.role === "trainer"
        ? trainerLinks
        : adminLinks;
  const roleSectionKey =
    user?.role === "member"
      ? "member"
      : user?.role === "trainer"
        ? "trainer"
        : "admin";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-[96rem]">
        <header className="overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-xl sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {user?.avatarDataUrl ? (
              <img
                src={user.avatarDataUrl}
                alt={user.name}
                className="h-24 w-24 rounded-full border-4 border-white/15 object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
                <UserRound size={40} />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
                {t("accountControl.eyebrow")}
              </p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                {user?.name}
              </h1>
              <p className="mt-2 text-slate-300">
                {user?.email} · {user?.role && t(`roles.${user.role}`)}
              </p>
            </div>
          </div>
        </header>

        <AccountSupportIdentifier />

        <section className="mt-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            {t("accountControl.personalSection")}
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            {t("accountControl.personalSectionTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            {t("accountControl.personalSectionDescription")}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {personalLinks.map((shortcut) => (
              <ShortcutCard
                key={shortcut.to}
                shortcut={shortcut}
                actionLabel={t("accountControl.open")}
              />
            ))}
            <div className="flex min-h-64 flex-col rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6">
              <span className="inline-flex w-fit rounded-2xl bg-slate-100 p-3 text-slate-600">
                <Bell />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-950">
                {t("accountControl.notifications")}
              </h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">
                {t("accountControl.notificationsDescription")}
              </p>
              <span className="mt-5 font-semibold text-slate-500">
                {t("accountControl.comingSoon")}
              </span>
            </div>
            <div className="flex min-h-64 flex-col rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6">
              <span className="inline-flex w-fit rounded-2xl bg-slate-100 p-3 text-slate-600">
                <Settings2 />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-950">
                {t("accountControl.preferences")}
              </h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">
                {t("accountControl.preferencesDescription")}
              </p>
              <span className="mt-5 font-semibold text-slate-500">
                {t("accountControl.comingSoon")}
              </span>
            </div>
          </div>
        </section>

        <section className="my-10">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            {t(`accountControl.${roleSectionKey}Section`)}
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            {t(`accountControl.${roleSectionKey}SectionTitle`)}
          </h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            {t(`accountControl.${roleSectionKey}SectionDescription`)}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roleLinks.map((shortcut) => (
              <ShortcutCard
                key={shortcut.to}
                shortcut={shortcut}
                actionLabel={t("accountControl.open")}
              />
            ))}
          </div>
          {user?.role !== "member" && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-950">
              {t("accountControl.linkedMemberNotice")}
            </div>
          )}
        </section>

        <ProfilePhotoSettings />

        {user?.role === "member" && (
          <>
            <DelegationManager />
            <section className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 shrink-0" size={19} />
                <p>{t("accountControl.delegationSecurity")}</p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
