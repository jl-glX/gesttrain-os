import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import { Navigation } from "./components/Navigation";
import { useTranslation } from "react-i18next";

function lazyPage<TModule, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as React.ComponentType };
  });
}

const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const ClassesPage = lazyPage(
  () => import("./pages/ClassesPage"),
  "ClassesPage",
);
const MyBookingsPage = lazyPage(
  () => import("./pages/MyBookingsPage"),
  "MyBookingsPage",
);
const LoginPage = lazyPage(() => import("./pages/LoginPage"), "LoginPage");
const SignupPage = lazyPage(() => import("./pages/SignupPage"), "SignupPage");
const TrainerDashboardPage = lazyPage(
  () => import("./pages/TrainerDashboardPage"),
  "TrainerDashboardPage",
);
const AdminDashboardPage = lazyPage(
  () => import("./pages/AdminDashboardPage"),
  "AdminDashboardPage",
);
const ActivityDashboardPage = lazyPage(
  () => import("./pages/ActivityDashboardPage"),
  "ActivityDashboardPage",
);
const TrainerAnalyticsDashboardPage = lazyPage(
  () => import("./pages/TrainerAnalyticsDashboardPage"),
  "TrainerAnalyticsDashboardPage",
);
const AdminAnalyticsDashboardPage = lazyPage(
  () => import("./pages/AdminAnalyticsDashboardPage"),
  "AdminAnalyticsDashboardPage",
);
const UnauthorizedPage = lazyPage(
  () => import("./pages/UnauthorizedPage"),
  "UnauthorizedPage",
);
const LegalNoticePage = lazyPage(
  () => import("./pages/LegalPage"),
  "LegalNoticePage",
);
const TermsAndConditionsPage = lazyPage(
  () => import("./pages/LegalPage"),
  "TermsAndConditionsPage",
);
const ConditionsOfUsePage = lazyPage(
  () => import("./pages/LegalPage"),
  "ConditionsOfUsePage",
);
const AccountSecurityPage = lazyPage(
  () => import("./pages/AccountSecurityPage"),
  "AccountSecurityPage",
);
const FeedbackPage = lazyPage(
  () => import("./pages/FeedbackPage"),
  "FeedbackPage",
);
const MemberPaymentsPage = lazyPage(
  () => import("./pages/MemberPaymentsPage"),
  "MemberPaymentsPage",
);
const AccountControlPage = lazyPage(
  () => import("./pages/AccountControlPage"),
  "AccountControlPage",
);
const WorkoutTimerPage = lazyPage(
  () => import("./pages/WorkoutTimerPage"),
  "WorkoutTimerPage",
);
const DownloadsPage = lazyPage(
  () => import("./pages/DownloadsPage"),
  "DownloadsPage",
);
const ResourceManagerPage = lazyPage(
  () => import("./pages/ResourceManagerPage"),
  "ResourceManagerPage",
);
const BillingPage = lazyPage(
  () => import("./pages/BillingPage"),
  "BillingPage",
);

type UserRole = "member" | "trainer" | "admin";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
}

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { t } = useTranslation();
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user.role)) {
      return <UnauthorizedPage />;
    }
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { user, isInitializing } = useAuth();
  const { pathname } = useLocation();
  const isLegalPage = [
    "/legal-notice",
    "/terms-and-conditions",
    "/conditions-of-use",
  ].includes(pathname);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <>
      {user && !isLegalPage && <Navigation />}
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-slate-600">
            {t("common.loading")}
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={user ? <HomePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/classes"
            element={
              <ProtectedRoute>
                <ClassesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute>
                <MyBookingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountControlPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account/security"
            element={
              <ProtectedRoute>
                <AccountSecurityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-payments"
            element={
              <ProtectedRoute requiredRole="member">
                <MemberPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workout-timer"
            element={
              <ProtectedRoute requiredRole="member">
                <WorkoutTimerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/downloads"
            element={
              <ProtectedRoute>
                <DownloadsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/resource-manager"
            element={
              <ProtectedRoute requiredRole="admin">
                <ResourceManagerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute requiredRole="admin">
                <BillingPage />
              </ProtectedRoute>
            }
          />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route
            path="/trainer-dashboard"
            element={
              <ProtectedRoute requiredRole="trainer">
                <TrainerDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity-dashboard"
            element={
              <ProtectedRoute requiredRole="member">
                <ActivityDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trainer-analytics"
            element={
              <ProtectedRoute requiredRole="trainer">
                <TrainerAnalyticsDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-analytics"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminAnalyticsDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/legal-notice" element={<LegalNoticePage />} />
          <Route
            path="/terms-and-conditions"
            element={<TermsAndConditionsPage />}
          />
          <Route path="/conditions-of-use" element={<ConditionsOfUsePage />} />
          <Route
            path="*"
            element={<Navigate to={user ? "/" : "/login"} replace />}
          />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
