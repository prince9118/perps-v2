"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/lib/api";

export default function AuthInitializer() {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    authApi.me()
      .then((res) => {
        setUser(res.data.user, token);
      })
      .catch(() => {
        logout();
      });
  }, []);

  return null;
}
