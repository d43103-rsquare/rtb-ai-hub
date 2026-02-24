import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { WorkflowDetailPage } from './pages/WorkflowDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatPage } from './pages/ChatPage';
import { AgentChatPage } from './pages/AgentChatPage';
import { ROUTES } from './utils/constants';
import { useAuth } from './hooks/useAuth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route
        path={ROUTES.DASHBOARD}
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.WORKFLOWS}
        element={
          <ProtectedRoute>
            <Layout>
              <WorkflowsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.MONITORING}
        element={
          <ProtectedRoute>
            <Layout>
              <MonitoringPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitoring/:workflowKey"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkflowDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.AGENT_CHAT}
        element={
          <ProtectedRoute>
            <Layout>
              <AgentChatPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.CHAT}
        element={
          <ProtectedRoute>
            <Layout>
              <ChatPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.PROFILE}
        element={
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
