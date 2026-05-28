import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { hasToken } from "@/lib/api";
import { Login } from "@/pages/Login";
import { AccountList } from "@/pages/AccountList";
import { EmailList } from "@/pages/EmailList";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return hasToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><AccountList /></PrivateRoute>} />
        <Route path="/emails/:accountId/:folder" element={<PrivateRoute><EmailList /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
