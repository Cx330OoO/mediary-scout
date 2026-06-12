"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** History-aware back: returns to wherever the user came from (search or library). */
export function BackLink({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      className="nav-item back-link"
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <ArrowLeft size={16} aria-hidden />
      返回
    </button>
  );
}
