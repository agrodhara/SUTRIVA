"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type Status = "checking" | "connected" | "unavailable";

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!cancelled) {
          setStatus(response.ok ? "connected" : "unavailable");
        }
      } catch {
        if (!cancelled) {
          setStatus("unavailable");
        }
      }
    }

    checkHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    status === "connected"
      ? "Backend connected"
      : status === "unavailable"
      ? "Backend unavailable"
      : "Checking backend...";

  return (
    <p className={`backendStatus backendStatus--${status}`} role="status">
      {label}
    </p>
  );
}
