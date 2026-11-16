import React, { useEffect, useState } from "react";
import { rpc } from "./api.js";

const store = {
  get() { try { return JSON.parse(localStorage.getItem("masa-tokens") || "{}"); } catch { return {}; } },
  set(code, token) { try { const o = store.get(); o[code] = token; localStorage.setItem("masa-tokens", JSON.stringify(o)); } catch { /* */ } },
};

export default function Join({ code: initial }) {
  const [code, setCode] = useState(initial || "");
  const [ws, setWs] = useState(null);
  const [name, setName] = useState("");
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const saved = code.length === 4 ? store.get()[code] : null;

  useEffect(() => {
    setWs(null); setErr("");
    if (code.length !== 4) return;
    rpc("masa_workshop_info", { p_code: code })
      .then((w) => { if (w) setWs(w); else setErr("לא מצאנו סדנה עם הקוד הזה. כדאי לבדוק אותו מול המסך."); })
      .catch(() => setErr("אין חיבור כרגע. נסו שוב בעוד רגע."));
  }, [code]);

  async function start(e) {
    e.preventDefault();
    if (!ws || !name.trim() || !form) return;
    setBusy(true); setErr("");
    try {
      const r = await rpc("masa_join", { p_code: code, p_name: name.trim(), p_form: form });
      store.set(code, r.token);
      location.hash = `/s/${r.token}`;
    } catch (e2) {
      setErr(String(e2.message).includes("closed") ? "הסדנה הזאת כבר סגורה להצטרפות." : "משהו נתקע. נסו שוב.");
      setBusy(false);
    }
  }

  return (
    <main className="join-hero">
      <form className="join-box" onSubmit={start}>
        <img className="burst" src="./burst.png" alt="" />
        <h1 className="title">מפת המסע שלי</h1>
        <p className="lead">מספרים על התחנות שעשו אותנו למי שאנחנו היום, ויוצאים עם מפה מאוירת של הדרך, מוכנה להדפסה.</p>

        <div className="panel section">
          <label className="field">
            <span>קוד הסדנה</span>
            <input className="input code-input" inputMode="numeric" autoComplete="off" maxLength={4}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" aria-describedby="code-hint" />
            <small id="code-hint">ארבע ספרות, מופיעות על המסך בחדר</small>
          </label>

          {ws && (
            <>
              <p className="hint" style={{ marginTop: 14 }}>נכנסים ל<b style={{ color: "var(--ink)" }}>{ws.name}</b></p>
              {saved && (
                <a className="btn small" style={{ marginTop: 12 }} href={`#/s/${saved}`}>להמשיך מאיפה שעצרתי</a>
              )}
              <label className="field">
                <span>השם שלך</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="שם פרטי ושם משפחה" />
                <small>השם המלא יופיע בכותרת המפה</small>
              </label>
              <div className="field" role="radiogroup" aria-label="באיזו לשון לפנות">
                <span>באיזו לשון לפנות?</span>
                <div className="choice-row">
                  <button type="button" className={`choice ${form === "f" ? "on" : ""}`} aria-pressed={form === "f"} onClick={() => setForm("f")}>
                    <b>את</b><span>בלשון נקבה</span>
                  </button>
                  <button type="button" className={`choice ${form === "m" ? "on" : ""}`} aria-pressed={form === "m"} onClick={() => setForm("m")}>
                    <b>אתה</b><span>בלשון זכר</span>
                  </button>
                </div>
              </div>
            </>
          )}
          {err && <div className="error" role="alert">{err}</div>}
        </div>

        <div className="actions">
          <button className="btn primary" disabled={!ws || !name.trim() || !form || busy} style={{ width: "100%" }}>
            {busy ? <span className="spin" /> : "מתחילים"}
          </button>
        </div>
      </form>
    </main>
  );
}
