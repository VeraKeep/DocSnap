import { Link } from "@tanstack/react-router";
import { ModuleBrandIcon, ModuleWordmark, moduleAccent } from "./ModuleBrandIcon";

type ModuleName = "HomeSnap" | "MeetingSnap" | "GarageSnap" | "ReceiptSnap" | "BillSnap" | "ContractSnap" | "BookSnap";

export function ModulePageHeader({ name, title, description }: { name: ModuleName; title: string; description: string }) {
  const accent = moduleAccent(name);
  return (
    <>
      <header className="border-b border-cyan-400/10 bg-[#020914]/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 transition hover:opacity-90">
            <ModuleBrandIcon name={name} size={42} />
            <div className="leading-none">
              <ModuleWordmark name={name} className="text-lg" />
              <div className="mt-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <img src="/verakeep-mark.svg" alt="" className="h-3.5 w-3.5 rounded" /> A VeraKeep product
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-slate-500 transition hover:text-slate-200">Suite</Link>
            <Link to="/scan" className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-500/40 hover:text-white">← Back to app</Link>
          </div>
        </div>
      </header>
      <div className="relative overflow-hidden border-b border-slate-800/60 bg-gradient-to-br from-[#03101d] via-[#06182a] to-[#020914] px-4 py-10 sm:px-6 sm:py-14">
        <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 15% 10%, ${accent}18, transparent 32%)` }} />
        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ModuleBrandIcon name={name} size={84} />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>{name}</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{description}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
