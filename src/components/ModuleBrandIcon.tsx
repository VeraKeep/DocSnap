import type { ReactNode } from "react";

type ModuleName =
  | "DocSnap"
  | "HomeSnap"
  | "MeetingSnap"
  | "GarageSnap"
  | "ReceiptSnap"
  | "BillSnap"
  | "ContractSnap"
  | "BookSnap";

const accents: Record<ModuleName, string> = {
  DocSnap: "#10bdf3",
  HomeSnap: "#36e2cf",
  MeetingSnap: "#9b7cff",
  GarageSnap: "#ffad42",
  ReceiptSnap: "#61e883",
  BillSnap: "#ff5c63",
  ContractSnap: "#f5c84d",
  BookSnap: "#16c3ff",
};

function Glyph({ name }: { name: ModuleName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glyphs: Record<ModuleName, ReactNode> = {
    DocSnap: <><path {...common} d="M20 17v-6.2L15.2 6H7.8A2.8 2.8 0 0 0 5 8.8v10.4A2.8 2.8 0 0 0 7.8 22h9.4a2.8 2.8 0 0 0 2.8-2.8Z"/><path {...common} d="M15 6v5h5M9 14h7M9 18h5"/></>,
    HomeSnap: <><path {...common} d="m5 13 7-6 7 6v8H5z"/><path {...common} d="M9 21v-5h6v5"/></>,
    MeetingSnap: <><circle {...common} cx="9" cy="10" r="2.5"/><circle {...common} cx="16" cy="10" r="2.5"/><path {...common} d="M4.5 20c.6-3.1 2.2-4.6 4.5-4.6s4 1.5 4.5 4.6M12.5 20c.5-2.6 1.8-4 3.8-4 2.1 0 3.5 1.4 4 4"/></>,
    GarageSnap: <><path {...common} d="M14.3 6.2a4.4 4.4 0 0 0-5.6 5.6L4.4 16a2.1 2.1 0 1 0 3 3l4.2-4.3a4.4 4.4 0 0 0 5.6-5.6l-2.6 2.6-2.3-2.3z"/></>,
    ReceiptSnap: <><path {...common} d="M7 5h10v16l-2-1.4-2 1.4-2-1.4L9 21l-2-1.4z"/><path {...common} d="M10 10h4M10 14h4"/><path {...common} d="M12 8v8" opacity=".45"/></>,
    BillSnap: <><path {...common} d="M6 20V9M11 20V5M16 20v-8M21 20V7"/><path {...common} d="M4 20h19"/></>,
    ContractSnap: <><path {...common} d="M7 5h10v16H7z"/><path {...common} d="M10 15c1.5-3 3.6 1.8 5.8-2.2M10 9h4"/></>,
    BookSnap: <><path {...common} d="M5 6.5A4.5 4.5 0 0 1 9.5 5H12v15H9.5A4.5 4.5 0 0 0 5 21.5z"/><path {...common} d="M19 6.5A4.5 4.5 0 0 0 14.5 5H12v15h2.5a4.5 4.5 0 0 1 4.5 1.5z"/></>,
  };
  return <>{glyphs[name]}</>;
}

export function ModuleBrandIcon({ name, size = 56, className = "" }: { name: ModuleName; size?: number; className?: string }) {
  const accent = accents[name];
  return (
    <span
      className={`relative inline-grid place-items-center rounded-[22%] border bg-[#071525] shadow-lg ${className}`}
      style={{ width: size, height: size, borderColor: `${accent}66`, boxShadow: `0 12px 34px ${accent}1f` }}
      aria-label={`${name} icon`}
      role="img"
    >
      <svg viewBox="0 0 28 28" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} style={{ color: accent }} aria-hidden="true">
        <Glyph name={name} />
      </svg>
      <span className="pointer-events-none absolute -left-[7%] -top-[7%] h-[26%] w-[26%] rounded-tl-md border-l-2 border-t-2" style={{ borderColor: accent }} />
      <span className="pointer-events-none absolute -right-[7%] -top-[7%] h-[26%] w-[26%] rounded-tr-md border-r-2 border-t-2" style={{ borderColor: accent }} />
      <span className="pointer-events-none absolute -bottom-[7%] -left-[7%] h-[26%] w-[26%] rounded-bl-md border-b-2 border-l-2" style={{ borderColor: accent }} />
      <span className="pointer-events-none absolute -bottom-[7%] -right-[7%] h-[26%] w-[26%] rounded-br-md border-b-2 border-r-2" style={{ borderColor: accent }} />
    </span>
  );
}

export function ModuleWordmark({ name, className = "" }: { name: ModuleName; className?: string }) {
  const base = name.replace(/Snap$/, "");
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className="text-white">{base}</span><span style={{ color: accents[name] }}>Snap</span>
    </span>
  );
}

export function moduleAccent(name: string) {
  return accents[(name in accents ? name : "DocSnap") as ModuleName];
}
