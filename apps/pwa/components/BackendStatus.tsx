"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

type Status = "checking" | "connected" | "unavailable" | "unconfigured";

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    if (!API_BASE_URL) {
      setStatus("unconfigured");
      return () => {
        cancelled = true;
      };
    }

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
      : status === "unconfigured"
      ? "Backend URL not configured"
      : "Checking backend...";

  return (
    <p className={`backendStatus backendStatus--${status}`} role="status">
      {label}
    </p>
  );
}
