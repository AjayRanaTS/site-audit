"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/auth-modal";

export default function LoginPage() {
  const router = useRouter();
  const authenticated = useRef(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080f20] text-slate-100">
      <AuthModal
        open
        onClose={() => {
          if (!authenticated.current) router.replace("/");
        }}
        onAuthenticated={() => {
          authenticated.current = true;
          const next = new URLSearchParams(window.location.search).get("next");
          const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
          router.replace(destination);
        }}
      />
    </main>
  );
}
