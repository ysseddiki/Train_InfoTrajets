import { reportApiResult } from "./statusBus";

const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let httpErrorHandled = false;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      httpErrorHandled = true;
      reportApiResult(false);
      let detail = "";
      try {
        const body = (await res.json()) as {
          title?: string;
          detail?: string;
        };
        detail = [body.title, body.detail].filter(Boolean).join(" — ");
      } catch {
        /* ignore */
      }
      throw new Error(detail || `API ${path} → ${res.status}`);
    }
    reportApiResult(true);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (!httpErrorHandled) {
      reportApiResult(false);
    }
    throw err;
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiSend<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
