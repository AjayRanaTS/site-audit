"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileDown,
  FileText,
  Menu,
  RefreshCw,
  Share2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { DeviceSelector } from "@/components/audit-report-ui";
import ProfileMenu from "@/components/profile-menu";
import type { Device } from "@/lib/audit-types";

export default function AuditReportToolbar({
  url,
  auditedAt,
  status,
  redirects,
  device,
  onDeviceChange,
  user,
  onSignOut,
  loading,
  onOpenNavigation,
  onRerun,
  onShare,
  copied,
  onExportDoc,
  onExportPdf,
}: {
  url: string;
  auditedAt: string | null;
  status: number;
  redirects: number | undefined;
  device: Device;
  onDeviceChange: (device: Device) => void;
  user: User | null;
  onSignOut: () => void;
  loading: boolean;
  onOpenNavigation: () => void;
  onRerun: () => void;
  onShare: () => void;
  copied: boolean;
  onExportDoc: () => void;
  onExportPdf: () => void;
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function dismissExportMenu(event: Event) {
      if (event.type === "keydown" && (event as KeyboardEvent).key === "Escape") {
        setExportMenuOpen(false);
      } else if (event.type === "pointerdown" && !(event.target instanceof Node && exportMenuRef.current?.contains(event.target))) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismissExportMenu);
    document.addEventListener("keydown", dismissExportMenu);
    return () => {
      document.removeEventListener("pointerdown", dismissExportMenu);
      document.removeEventListener("keydown", dismissExportMenu);
    };
  }, [exportMenuOpen]);

  function exportWith(callback: () => void) {
    setExportMenuOpen(false);
    callback();
  }

  return (
    <div className="glass-panel sticky top-3 z-30 mb-5 flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={onOpenNavigation} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open report navigation"><Menu size={19} /></button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{url}</p>
            <p className="hidden text-[11px] text-slate-500 sm:block">{auditedAt ? new Date(auditedAt).toLocaleString() : "Audit completed"} · {status} response · {redirects ?? "n/a"} redirects</p>
          </div>
        </div>
        <div className="hidden shrink-0 lg:block"><DeviceSelector device={device} onChange={onDeviceChange} /></div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user && <ProfileMenu user={user} onSignOut={onSignOut} />}
          <button onClick={onRerun} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] disabled:opacity-50 sm:px-3"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Re-run Audit</span></button>
          <button onClick={onShare} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] sm:px-3"><Share2 size={14} /><span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span></button>
          <div ref={exportMenuRef} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-500/20 px-2.5 text-xs text-indigo-100 hover:bg-indigo-500/30 sm:px-3">
              <Download size={14} /><span>Export</span><ChevronDown size={13} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {exportMenuOpen && <div role="menu" aria-label="Export report" className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#101a2d] p-1.5 shadow-xl shadow-black/30">
              <button type="button" role="menuitem" onClick={() => exportWith(onExportDoc)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-white/[0.07]"><FileText size={15} className="text-slate-400" />Export as DOCX</button>
              <button type="button" role="menuitem" onClick={() => exportWith(onExportPdf)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-white/[0.07]"><FileDown size={15} className="text-slate-400" />Export as a PDF</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
