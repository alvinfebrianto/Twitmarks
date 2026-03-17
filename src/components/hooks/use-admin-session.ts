"use client";

import { useCallback, useState } from "react";

export function useAdminSession() {
  const [adminSecret, setAdminSecret] = useState(() => {
    try {
      return sessionStorage.getItem("twitmarks_admin") ?? "";
    } catch {
      return "";
    }
  });
  const isAdmin = adminSecret.length > 0;

  const persistAdminSecret = useCallback((secret: string) => {
    const trimmed = secret.trim();
    if (!trimmed) {
      return;
    }
    try {
      sessionStorage.setItem("twitmarks_admin", trimmed);
    } catch {
      // sessionStorage may be unavailable
    }
    setAdminSecret(trimmed);
  }, []);

  const lockAdmin = useCallback(() => {
    try {
      sessionStorage.removeItem("twitmarks_admin");
    } catch {
      // sessionStorage may be unavailable
    }
    setAdminSecret("");
  }, []);

  return { adminSecret, isAdmin, persistAdminSecret, lockAdmin };
}
