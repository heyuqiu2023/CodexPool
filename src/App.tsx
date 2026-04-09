import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { LoginDialog } from "@/components/LoginDialog";
import { api, getAuthToken, clearAuthToken } from "@/lib/api";
import Index from "./pages/Index.tsx";
import SettingsPage from "./pages/Settings.tsx";
import LogsPage from "./pages/Logs.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

const AppContent = () => {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await api.checkAuth();
        if (result.authRequired && !getAuthToken()) {
          setAuthState('unauthenticated');
        } else {
          setAuthState('authenticated');
        }
      } catch {
        // If check fails, assume authenticated if token exists
        if (getAuthToken()) {
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
        }
      }
    };

    checkAuth();

    const handleAuthRequired = () => {
      clearAuthToken();
      setAuthState('unauthenticated');
    };

    window.addEventListener('auth:required', handleAuthRequired);
    return () => window.removeEventListener('auth:required', handleAuthRequired);
  }, []);

  if (authState === 'checking') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <LoginDialog
        onAuthenticated={() => setAuthState('authenticated')}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Sonner />
            <AppContent />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
