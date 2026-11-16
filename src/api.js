export const SB = "https://ndrhiikczkbosentclnh.supabase.co";
const KEY = "sb_publishable_EckoZz1eIoRjjjQ9XhXhzA_EpuKVWQG";
const H = { apikey: KEY, "Content-Type": "application/json" };

export async function rpc(name, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) {
    let msg = t;
    try { msg = JSON.parse(t).message ?? t; } catch { /* */ }
    throw new Error(msg);
  }
  return t ? JSON.parse(t) : null;
}

export async function fn(action, payload = {}) {
  const r = await fetch(`${SB}/functions/v1/masa-ai`, { method: "POST", headers: H, body: JSON.stringify({ action, ...payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `שגיאה ${r.status}`);
  return d;
}

// לשון פנייה
export const g = (form, f, m) => (form === "m" ? m : f);

export const appUrl = (hash) => `${location.origin}${location.pathname}#${hash}`;
