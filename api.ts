const BASE = '/api';

function buildHeaders(opts: RequestInit): HeadersInit {
  const auto: Record<string, string> = {};
  if (opts.body && !(opts.body instanceof FormData)) {
    auto['Content-Type'] = 'application/json';
  }
  return { ...auto, ...(opts.headers as Record<string, string> | undefined) };
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: buildHeaders(opts) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiBlob(path: string, opts: RequestInit = {}): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: buildHeaders(opts) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.blob();
}
