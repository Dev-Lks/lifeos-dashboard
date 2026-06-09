import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Work from "./pages/Work";
import Finance from "./pages/Finance";
import Routine from "./pages/Routine";
import Automations from "./pages/Automations";
import Systems from "./pages/Systems";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white">
        <div className="animate-pulse text-lg">Loading LifeOS...</div>
      </div>
    );
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/work" element={<Work />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/routine" element={<Routine />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/systems" element={<Systems />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
