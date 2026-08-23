"use client";

/** Refresh a browser session once after an expired access cookie, then retry. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshBrowserSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export type ApiFetchOptions = RequestInit & {
  retryOnUnauthorized?: boolean;
};

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {}
): Promise<Response> {
  const { retryOnUnauthorized = true, credentials = "include", ...requestInit } = init;
  const response = await fetch(input, { ...requestInit, credentials });

  if (!retryOnUnauthorized || response.status !== 401) {
    return response;
  }

  if (!(await refreshBrowserSession())) {
    return response;
  }

  return fetch(input, { ...requestInit, credentials });
}
