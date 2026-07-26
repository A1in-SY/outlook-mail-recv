import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { hasToken, verifyToken, clearToken, UNAUTHORIZED_EVENT } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme";
import { Login } from "@/pages/Login";
import { AccountList } from "@/pages/AccountList";
import { EmailList } from "@/pages/EmailList";

type AuthState = "checking" | "authorized" | "unauthorized";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (hasToken() ? "checking" : "unauthorized"));

  useEffect(() => {
    if (state !== "checking") return;
    let active = true;
    verifyToken()
      .then(() => { if (active) setState("authorized"); })
      .catch(() => {
        clearToken();
        if (active) setState("unauthorized");
      });
    return () => { active = false; };
  }, [state]);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">加载中...</span>
      </div>
    );
  }
  if (state === "unauthorized") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Turns a 403 from any in-flight request into a client-side redirect. */
function UnauthorizedRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const handle = () => navigate("/login", { replace: true });
    window.addEventListener(UNAUTHORIZED_EVENT, handle);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle);
  }, [navigate]);

  return null;
}

function App() {
  const { resolved } = useTheme();

  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors theme={resolved} />
      <UnauthorizedRedirect />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><AccountList /></PrivateRoute>} />
        <Route path="/emails/:accountId/:folder" element={<PrivateRoute><EmailList /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
