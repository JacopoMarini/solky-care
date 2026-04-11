import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthState } from '@/hooks/useAuth';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Admin from '@/pages/Admin';
import { Toaster } from '@/components/Toaster';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  // La verifica del ruolo è fatta lato backend; qui controlliamo solo il token
  // La pagina Admin gestirà l'accesso non autorizzato via API 403
  return <>{children}</>;
}

function AppRoutes() {
  const authState = useAuthState();

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Caricamento…</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={authState}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            authState.user ? <Navigate to="/" replace /> : <Login />
          } />
          <Route path="/register" element={
            authState.user ? <Navigate to="/" replace /> : <Register />
          } />
          <Route path="/" element={
            <PrivateRoute>
              {authState.user?.role === 'admin' ? <Admin /> : <Dashboard />}
            </PrivateRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
          <Route path="/admin" element={
            <AdminRoute><Admin /></AdminRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthContext.Provider>
  );
}

export default AppRoutes;
