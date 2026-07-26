const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setToken(token: string) {
  localStorage.setItem("auth_token", token);
}

/** Fires whenever the session ends, by logout or by a rejected token. */
export const SESSION_ENDED_EVENT = "auth:session-ended";

export function clearToken() {
  localStorage.removeItem("auth_token");
  // Announced here rather than at each call site so per-session caches cannot be
  // left stale by a logout path that forgets to clear them.
  window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}

export function hasToken(): boolean {
  return !!getToken();
}

export const UNAUTHORIZED_EVENT = "auth:unauthorized";

/** Router-level listeners redirect on this, which avoids a full-page reload. */
function notifyUnauthorized() {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/** Carries the HTTP status so callers can tell a dead account from a passing glitch. */
export class ApiError extends Error {
  // Assigned in the body rather than as a parameter property: the tsconfig sets
  // `erasableSyntaxOnly`, which rejects the shorthand.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The mailbox credential is no longer usable (banned, revoked, or expired). Deliberately
 * not 401/403: `request()` treats 403 as *this app's* bearer token being bad and logs the
 * user out, so a dead mailbox must not share that code.
 */
export const ACCOUNT_AUTH_STATUS = 409;

export function isAccountAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === ACCOUNT_AUTH_STATUS;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${url}`, { ...init, headers });

  if (res.status === 403) {
    clearToken();
    notifyUnauthorized();
    throw new Error("Authentication required");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export function verifyToken(): Promise<{ ok: boolean }> {
  return request("/auth/verify");
}

export interface Platform {
  id: number;
  name: string;
}

export type MailProtocol = "imap" | "graph";

export interface Account {
  id: number;
  email: string;
  password: string;
  client_id: string;
  refresh_token: string;
  enabled_protocols: MailProtocol[];
  rt_expires_at: string | null;
  platforms: Platform[];
}

/** Mirrors backend AccountUpdate: every field is optional and patched when present. */
export interface AccountUpdate {
  password?: string;
  client_id?: string;
  refresh_token?: string;
  enabled_protocols?: MailProtocol[];
}

export interface EmailItem {
  id: number;
  account_id: number;
  folder: string;
  source_protocol: MailProtocol;
  external_id: string;
  sender: string;
  subject: string;
  received_ts_ms: number;
  body: string;
  body_html: string;
  body_fetched: boolean;
}

export interface ProtocolTestResult {
  ok: boolean;
  protocol: MailProtocol;
}

export const api = {
  accounts: {
    list: (page = 1, size = 20, search = "", availableFor?: number[]) => {
      let url = `/accounts?page=${page}&size=${size}&search=${encodeURIComponent(search)}`;
      if (availableFor?.length) {
        url += availableFor.map((id) => `&available_for=${id}`).join("");
      }
      return request<Account[]>(url);
    },
    count: (search = "", availableFor?: number[]) => {
      let url = `/accounts/count?search=${encodeURIComponent(search)}`;
      if (availableFor?.length) {
        url += availableFor.map((id) => `&available_for=${id}`).join("");
      }
      return request<{ total: number }>(url);
    },
    get: (id: number) => request<Account>(`/accounts/${id}`),
    create: (data: Omit<Account, "id">) =>
      request<Account>("/accounts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: AccountUpdate) =>
      request<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/accounts/${id}`, { method: "DELETE" }),
    import: (lines: string[], separator: string, enabled_protocols: MailProtocol[]) =>
      request<{ imported: number; skipped: number; errors: string[] }>(
        "/accounts/import",
        { method: "POST", body: JSON.stringify({ lines, separator, enabled_protocols }) }
      ),
    testProtocol: (line: string, separator: string, enabled_protocols: MailProtocol[]) =>
      request<ProtocolTestResult>(
        "/accounts/import/test-protocol",
        { method: "POST", body: JSON.stringify({ line, separator, enabled_protocols }) }
      ),
    export: (separator: string, ids?: number[]) => {
      let url = `/accounts/export?separator=${encodeURIComponent(separator)}`;
      if (ids?.length) {
        url += ids.map((id) => `&ids=${id}`).join("");
      }
      return request<{ lines: string[]; total: number }>(url);
    },
    getPlatforms: (id: number) =>
      request<Platform[]>(`/accounts/${id}/platforms`),
    updatePlatforms: (id: number, platformIds: number[]) =>
      request<Platform[]>(`/accounts/${id}/platforms`, {
        method: "PUT",
        body: JSON.stringify(platformIds),
      }),
  },
  platforms: {
    list: () => request<Platform[]>("/platforms"),
  },
  emails: {
    list: (accountId: number, folder: string, page = 1, size = 20) =>
      request<{ items: EmailItem[]; total: number }>(
        `/emails/${accountId}/${folder}?page=${page}&size=${size}`
      ),
    get: (emailId: number) => request<EmailItem>(`/emails/message/${emailId}`),
    refresh: (accountId: number, folder: string) =>
      request<{ ok: boolean }>(`/emails/${accountId}/${folder}/refresh`, { method: "POST" }),
  },
};
