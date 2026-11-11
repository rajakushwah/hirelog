import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { EmptyState, Spinner } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";

const ApplicationDetail = lazy(() => import("./pages/ApplicationDetail").then((m) => ({ default: m.ApplicationDetail })));
const ApplicationForm = lazy(() => import("./pages/ApplicationForm").then((m) => ({ default: m.ApplicationForm })));
const Applications = lazy(() => import("./pages/Applications").then((m) => ({ default: m.Applications })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Interviews = lazy(() => import("./pages/Interviews").then((m) => ({ default: m.Interviews })));
const OfferCard = lazy(() => import("./pages/OfferCard").then((m) => ({ default: m.OfferCard })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const QuestionForm = lazy(() => import("./pages/QuestionForm").then((m) => ({ default: m.QuestionForm })));
const Questions = lazy(() => import("./pages/Questions").then((m) => ({ default: m.Questions })));
const RoundDetail = lazy(() => import("./pages/RoundDetail").then((m) => ({ default: m.RoundDetail })));
const RoundForm = lazy(() => import("./pages/RoundForm").then((m) => ({ default: m.RoundForm })));
const admin = () => import("./pages/Admin");
const AdminOverviewPage = lazy(() => admin().then((m) => ({ default: m.AdminOverviewPage })));
const AdminUsersPage = lazy(() => admin().then((m) => ({ default: m.AdminUsersPage })));
const AdminUserPage = lazy(() => admin().then((m) => ({ default: m.AdminUserPage })));
const AdminMessagesPage = lazy(() => admin().then((m) => ({ default: m.AdminMessagesPage })));
const AdminAuditPage = lazy(() => admin().then((m) => ({ default: m.AdminAuditPage })));
const GetApp = lazy(() => import("./pages/GetApp").then((m) => ({ default: m.GetApp })));
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));


/** Only same-site paths are allowed as a post-login destination (no "//host" or "https://..."). */
function safeNext(path: unknown): string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const loc = useLocation();
  if (loading) return <Spinner full />;
  if (user) return <Navigate to={safeNext(params.get("next") ?? (loc.state as { from?: string } | null)?.from)} replace />;
  return <Login />;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.is_admin ? <>{children}</> : <Navigate to="/" replace />;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner full />;
  if (!user) return loc.pathname === "/" ? <Landing /> : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          title="Something went wrong"
          subtitle="Please reload the page to continue."
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner full />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/new" element={<ApplicationForm />} />
          <Route path="applications/:id" element={<ApplicationDetail />} />
          <Route path="applications/:id/edit" element={<ApplicationForm />} />
          <Route path="applications/:id/offer" element={<OfferCard />} />
          <Route path="interviews" element={<Interviews />} />
          <Route path="rounds/new" element={<RoundForm />} />
          <Route path="rounds/:id" element={<RoundDetail />} />
          <Route path="rounds/:id/edit" element={<RoundForm />} />
          <Route path="get-app" element={<GetApp />} />
          <Route path="admin" element={<AdminOnly><AdminOverviewPage /></AdminOnly>} />
          <Route path="admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
          <Route path="admin/users/:id" element={<AdminOnly><AdminUserPage /></AdminOnly>} />
          <Route path="admin/messages" element={<AdminOnly><AdminMessagesPage /></AdminOnly>} />
          <Route path="admin/audit" element={<AdminOnly><AdminAuditPage /></AdminOnly>} />
          <Route path="questions" element={<Questions />} />
          <Route path="questions/new" element={<QuestionForm />} />
          <Route path="questions/:id/edit" element={<QuestionForm />} />
          <Route path="search" element={<Search />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<EmptyState title="Page not found" subtitle="The page you opened doesn't exist." />} />
        </Route>
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
