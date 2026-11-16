import React, { useEffect, useState } from "react";
import { rpc, appUrl } from "./api.js";

export default function Create({ master }) {
  const [name, setName] = useState("");
  const [chat, setChat] = useState(true);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => rpc("masa_list_workshops", { p_master: master }).then(setList).catch(() => setErr("הקישור הזה לא מאפשר לפתוח סדנאות."));
  useEffect(() => { load(); }, [master]);

  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      const w = await rpc("masa_create_workshop", { p_master: master, p_name: name.trim(), p_allow_chat: chat });
      location.hash = `/op/${w.admin_key}`;
    } catch { setErr("לא הצלחנו לפתוח את הסדנה."); setBusy(false); }
  }

  return (
    <div className="op">
      <header className="op-top"><img src="./burst.png" alt="" style={{ width: 28 }} /><h1>מפת המסע · סדנאות</h1></header>
      <main className="op-main" style={{ maxWidth: 860 }}>
        {err && <div className="error">{err}</div>}
        {list && <>
          <form className="panel" onSubmit={create}>
            <h2 style={{ fontSize: 22 }}>סדנה חדשה</h2>
            <label className="field"><span>שם הסדנה</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="למשל: מפגש מנהלות, חותם נעמי" />
            </label>
            <label className="field" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span style={{ fontWeight: 500 }}>לאפשר גם שיחה עם מלווה, לא רק כתיבה לבד</span>
            </label>
            <div className="actions"><button className="btn primary" disabled={!name.trim() || busy}>לפתוח סדנה</button></div>
          </form>
          <section className="section">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>סדנאות קיימות</h2>
            {list.length === 0 && <p className="hint">עוד אין סדנאות.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {list.map((w) => <WorkshopRow key={w.code} w={w} master={master} onSaved={load} />)}
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}

function WorkshopRow({ w, master, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(w.name);
  const [chat, setChat] = useState(w.allow_chat);
  const [open, setOpen] = useState(w.is_open);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  function start() { setName(w.name); setChat(w.allow_chat); setOpen(w.is_open); setErr(""); setEdit(true); }
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await rpc("masa_edit_workshop", { p_master: master, p_code: w.code, p_patch: { name: name.trim(), allow_chat: chat, is_open: open } });
      await onSaved(); setEdit(false);
    } catch { setErr("השמירה לא הצליחה. נסו שוב."); }
    setBusy(false);
  }
  function copy() {
    navigator.clipboard?.writeText(appUrl(`/j/${w.code}`)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  if (edit) return (
    <form className="panel" onSubmit={save} style={{ padding: 16, display: "grid", gap: 12 }}>
      <label className="field"><span>שם הסדנה</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
      </label>
      <label className="field" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span style={{ fontWeight: 500 }}>לאפשר גם שיחה עם מלווה, לא רק כתיבה לבד</span>
      </label>
      <label className="field" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span style={{ fontWeight: 500 }}>פתוחה להצטרפות משתתפים חדשים</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>הקוד ({w.code}) והקישור לעמדת ההפעלה נשארים כמו שהם.</p>
      {err && <div className="error" style={{ margin: 0 }}>{err}</div>}
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary small" disabled={!name.trim() || busy}>{busy ? <span className="spin" /> : "לשמור"}</button>
        <button type="button" className="btn ghost small" onClick={() => setEdit(false)}>ביטול</button>
      </div>
    </form>
  );

  return (
    <div className="panel" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <b style={{ flex: 1, minWidth: 160 }}>{w.name}</b>
      <span className="chip blue">קוד {w.code}</span>
      {!w.is_open && <span className="chip bad">סגורה להצטרפות</span>}
      <span className="hint">{w.count} משתתפים</span>
      <a className="btn small" href={`#/op/${w.admin_key}`}>לעמדת ההפעלה</a>
      <button className="btn small ghost" onClick={copy}>{copied ? "הקישור הועתק" : "קישור הצטרפות"}</button>
      <button className="btn small ghost" onClick={start}>עריכה</button>
    </div>
  );
}
