import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  CreditCard,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Building2,
  MonitorDown,
  ServerCog,
  Database,
  Route,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../components/LegalFooter";
import { useFacilityProfile } from "../hooks/useFacilityProfile";

export function HomePage() {
  const user = useCurrentUser();
  const { t } = useTranslation();
  if (user?.role === "admin") return <AdminHome name={user.name} />;
  const features = [
    {
      icon: CalendarDays,
      title: t("home.features.calendarTitle"),
      text: t("home.features.calendarText"),
    },
    {
      icon: Users,
      title: t("home.features.waitlistTitle"),
      text: t("home.features.waitlistText"),
    },
    {
      icon: Bookmark,
      title: t("home.features.bookingTitle"),
      text: t("home.features.bookingText"),
    },
    {
      icon: BarChart3,
      title: t("home.features.analyticsTitle"),
      text: t("home.features.analyticsText"),
    },
  ];

  return (
    <main className="min-h-[calc(100vh-4.5rem)] overflow-hidden bg-slate-950 text-white">
      <section className="relative mx-auto max-w-[96rem] px-4 py-16 sm:px-6 sm:py-24 2xl:px-8">
        <div className="absolute -right-44 top-0 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            {user && (
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-blue-100">
                <Sparkles size={15} /> {t("home.welcome", { name: user.name })}
              </div>
            )}
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              {t("home.title")}{" "}
              <span className="bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                {t("home.titleAccent")}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              {t("home.description")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/classes">
                <Button
                  className="h-12 w-full gap-2 rounded-xl bg-blue-600 px-6 shadow-lg shadow-blue-600/25 hover:bg-blue-500 sm:w-auto"
                  size="lg"
                >
                  <CalendarDays size={20} />
                  {t("home.browse")}
                  <ArrowRight size={18} />
                </Button>
              </Link>
              <Link to="/my-bookings">
                <Button
                  variant="outline"
                  className="h-12 w-full gap-2 rounded-xl border-white/20 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  size="lg"
                >
                  <Bookmark size={20} />
                  {t("home.bookings")}
                </Button>
              </Link>
              <Link to="/downloads">
                <Button
                  variant="outline"
                  className="h-12 w-full gap-2 rounded-xl border-white/20 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  size="lg"
                >
                  <MonitorDown size={20} />
                  {t("home.downloads")}
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, text }, index) => (
              <div
                key={title}
                className={`rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-sm transition-transform hover:-translate-y-1 ${index % 2 === 1 ? "sm:translate-y-6" : ""}`}
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
                  <Icon size={22} />
                </div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}

function AdminHome({ name }: { name: string }) {
  const { t } = useTranslation();
  const { profile } = useFacilityProfile();
  const actions = [
    {
      to: "/classes",
      icon: CalendarDays,
      title: t("adminHome.classes"),
      text: t("adminHome.classesDescription"),
    },
    {
      to: "/admin-dashboard",
      icon: Settings,
      title: t("adminHome.management"),
      text: t("adminHome.managementDescription"),
    },
    {
      to: "/billing",
      icon: CreditCard,
      title: t("adminHome.billing"),
      text: t("adminHome.billingDescription"),
    },
    {
      to: "/admin-analytics",
      icon: BarChart3,
      title: t("adminHome.analytics"),
      text: t("adminHome.analyticsDescription"),
    },
    {
      to: "/downloads",
      icon: MonitorDown,
      title: t("adminHome.downloads"),
      text: t("adminHome.downloadsDescription"),
    },
    {
      to: "/admin/resource-manager",
      icon: ServerCog,
      title: t("adminHome.resources"),
      text: t("adminHome.resourcesDescription"),
    },
    {
      to: "/admin/environment-manager",
      icon: Database,
      title: t("adminHome.environments"),
      text: t("adminHome.environmentsDescription"),
    },
    {
      to: "/admin/capability-roadmap",
      icon: Route,
      title: t("adminHome.capabilityRoadmap"),
      text: t("adminHome.capabilityRoadmapDescription"),
    },
  ];

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 text-slate-950">
      <section className="mx-auto max-w-[96rem] px-4 py-10 sm:px-6 sm:py-14 2xl:px-8">
        <div
          className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
          style={{ borderTopColor: profile.accentColor, borderTopWidth: 4 }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-5 flex items-center gap-3">
                {profile.logoDataUrl ? (
                  <img
                    src={profile.logoDataUrl}
                    alt={profile.name}
                    className="h-14 w-14 rounded-xl object-contain"
                  />
                ) : (
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: profile.accentColor }}
                  >
                    <Building2 size={26} />
                  </span>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("facilityBranding.currentFacility")}
                  </p>
                  <p className="font-bold text-slate-950">{profile.name}</p>
                </div>
              </div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                <ShieldCheck size={16} />
                {t("adminHome.welcome", { name })}
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                {t("adminHome.title")}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
                {t("adminHome.description")}
              </p>
            </div>
            <Link to="/classes">
              <Button
                className="h-12 gap-2 rounded-xl px-6"
                style={{ backgroundColor: profile.accentColor }}
              >
                <CalendarDays /> {t("adminHome.createClass")}
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ to, icon: Icon, title, text }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50"
                style={{ color: profile.accentColor }}
              >
                <Icon size={21} />
              </span>
              <h2 className="mt-5 font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </Link>
          ))}
        </div>
      </section>
      <LegalFooter />
    </main>
  );
}
