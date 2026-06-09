import { Outlet, NavLink, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/", label: "Home", icon: "🏠" },
  { to: "/work", label: "Work", icon: "📋" },
  { to: "/finance", label: "Finance", icon: "💰" },
  { to: "/routine", label: "Routine", icon: "🔄" },
  { to: "/automations", label: "Automations", icon: "🤖" },
  { to: "/systems", label: "Systems", icon: "⚙️" },
];

export default function Layout() {
  const navigate = useNavigate();

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    navigate("/");
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside className="w-56 border-r border-white/10 p-4 flex flex-col gap-2 bg-[#0f0f0f]">
        <div className="text-[#00e5a0] font-bold text-xl mb-6">LifeOS</div>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                isActive
                  ? "bg-[#00e5a0]/10 text-[#00e5a0] font-semibold"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <button
          onClick={logout}
          className="px-3 py-2 rounded-lg text-sm text-white/40 hover:text-red-400 hover:bg-red-400/10 text-left"
        >
          ⏻ Logout
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
