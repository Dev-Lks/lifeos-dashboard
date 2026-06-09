export type ApiError = Error & { status?: number };

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body: unknown = {}) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown = {}) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' })
};

export function money(value = 0): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function shortDate(date?: string): string {
  if (!date) return 'sem data';
  return new Date(date.includes('T') ? date : `${date}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  });
}

export function relative(value?: string): string {
  if (!value) return 'nunca';
  const then = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}
