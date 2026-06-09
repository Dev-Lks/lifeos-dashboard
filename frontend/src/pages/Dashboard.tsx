import { useEffect, useState } from "react";

interface Snapshot {
  system?: { cpu: number; mem: number; disk: number; uptime: string };
  agents?: { name: string; status: string; last_active: string }[];
  stats?: Record<string, number>;
}

export default function Dashboard() {
  const [data, setData] = useState<Snapshot | null>(null);

  useEffect(() => {
    // SSE for live updates
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      try {
        setData(JSON.parse(ev.data));
      } catch {}
    };
    return () => es.close();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* System health cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "CPU", val: data?.system?.cpu, unit: "%", color: "#00e5a0" },
          { label: "Memory", val: data?.system?.mem, unit: "%", color: "#ffb6c1" },
          { label: "Disk", val: data?.system?.disk, unit: "%", color: "#7ec8e3" },
        ].map(({ label, val, unit, color }) => (
          <div
            key={label}
            className="bg-[#111] border border-white/5 rounded-xl p-5"
          >
            <p className="text-white/40 text-sm mb-1">{label}</p>
            <p className="text-3xl font-bold" style={{ color }}>
              {val ?? "—"}
              {val !== undefined && <span className="text-sm ml-1">{unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Agent status */}
      <div className="bg-[#111] border border-white/5 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Agents</h2>
        <div className="space-y-2">
          {data?.agents?.map((a) => (
            <div
              key={a.name}
              className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
            >
              <span className="font-medium">{a.name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  a.status === "active"
                    ? "bg-[#00e5a0]/20 text-[#00e5a0]"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {a.status}
              </span>
            </div>
          )) ?? (
            <p className="text-white/30 text-sm">No agent data yet</p>
          )}
        </div>
      </div>

      {data?.system?.uptime && (
        <p className="text-white/20 text-xs">Uptime: {data.system.uptime}</p>
      )}
    </div>
  );
}
