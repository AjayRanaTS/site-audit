"use client";

import { ClipboardList, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getUserDisplayName, getUserInitials } from "@/lib/profile";

export default function ProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  function navigateTo(path: "/profile" | "/my-tests") {
    setOpen(false);
    router.push(path);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-300/30 bg-gradient-to-br from-indigo-500/30 to-cyan-500/20 text-xs font-semibold tracking-wide text-cyan-100 transition hover:border-cyan-200/60 hover:brightness-110"
        title={`${displayName} account menu`}
        aria-label={`${displayName} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open && (
        <div role="menu" aria-label="Account menu" className="account-menu absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b1428] p-1.5 shadow-2xl shadow-black/50">
          <div className="border-b border-white/[0.08] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            {user.email && <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>}
          </div>
          <button type="button" role="menuitem" onClick={() => navigateTo("/profile")} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
            <UserRound size={16} className="text-slate-400" />My profile
          </button>
          <button type="button" role="menuitem" onClick={() => navigateTo("/my-tests")} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
            <ClipboardList size={16} className="text-slate-400" />My tests
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-rose-200 transition hover:bg-rose-400/[0.08]">
            <LogOut size={16} />Log out
          </button>
        </div>
      )}
    </div>
  );
}
