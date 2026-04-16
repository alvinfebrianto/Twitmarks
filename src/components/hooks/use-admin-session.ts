"use client";

import { useCallback, useState } from "react";

export function useAdminSession(initialIsAdmin = false) {
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);

  const unlockAdmin = useCallback(async (secret: string) => {
    const trimmed = secret.trim();
    if (!trimmed) {
      return;
    }

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: trimmed }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        response.status === 401
          ? "Invalid admin secret."
          : ((data as Record<string, string>).why ??
              (data as Record<string, string>).error ??
              "Failed to unlock admin.")
      );
    }

    setIsAdmin(true);
  }, []);

  const lockAdmin = useCallback(async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Ignore network errors – we log out locally regardless.
    } finally {
      setIsAdmin(false);
    }
  }, []);

  const changeAdminSecret = useCallback(async (secret: string) => {
    const trimmed = secret.trim();
    if (!trimmed) {
      return;
    }

    const response = await fetch("/api/admin/secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: trimmed }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setIsAdmin(false);
        throw new Error("Admin session expired. Please unlock again.");
      }

      throw new Error(
        (data as Record<string, string>).why ??
          (data as Record<string, string>).error ??
          "Failed to update admin secret."
      );
    }
  }, []);

  const expireAdmin = useCallback(() => {
    setIsAdmin(false);
  }, []);

  return { isAdmin, unlockAdmin, lockAdmin, changeAdminSecret, expireAdmin };
}
