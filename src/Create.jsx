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
              {list.map((w) => (
                <div key={w.code} className="panel" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ flex: 1 }}>{w.name}</b>
                  <span className="chip blue">קוד {w.code}</span>
                  <span className="hint">{w.count} משתתפים</span>
                  <a className="btn small" href={`#/op/${w.admin_key}`}>לעמדת ההפעלה</a>
                  <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(appUrl(`/j/${w.code}`))}>קישור הצטרפות</button>
                </div>
              ))}
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}
