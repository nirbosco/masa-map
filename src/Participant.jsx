import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { rpc, fn, g, appUrl } from "./api.js";
import { Summary, Icon } from "./ui.jsx";

export const WORLDS = [
  { id: "mountains", label: "דרך בין הרים", note: "שביל זהב, עמקים ונהרות", img: "./worlds/mountains.jpg" },
  { id: "sea", label: "מסע ימי", note: "איים, סערות ומפרש", img: "./worlds/sea.jpg" },
  { id: "forest", label: "יער קסום", note: "עצים עתיקים ומפלים", img: "./worlds/forest.jpg" },
  { id: "desert", label: "מדבר וכוכבים", note: "דיונות, נאות ושיירות", img: "./worlds/desert.jpg" },
  { id: "city", label: "עיר ורחובות", note: "גשרים, רכבות וגגות", img: "./worlds/city.jpg" },
  { id: "sky", label: "מעל העננים", note: "איים מרחפים וכדור פורח", img: "./worlds/sky.jpg" },
];
export const STYLES = [
  { id: "storybook", label: "איור חם של ספר ילדים" },
  { id: "watercolor", label: "צבעי מים" },
  { id: "antique", label: "מפה עתיקה על קלף" },
  { id: "epic", label: "ציור אפי ודרמטי" },
];
export const MOODS = [
  { id: "dawn", label: "זריחה" },
  { id: "day", label: "אור יום" },
  { id: "sunset", label: "שקיעה" },
  { id: "night", label: "לילה וכוכבים" },
];

const EMPTY = () => ({ title: "", when: "", story: "", took: "" });
const LIMIT = { heading: 18, sub: 26, side: 18, gear: 34, title: 24 };

function Steps({ at }) {
  return <div className="steps" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={i <= at ? "on" : ""} />)}</div>;
}

function useSaver(token) {
  const t = useRef(null);
  const pending = useRef({});
  return (patch, now = false) => {
    Object.assign(pending.current, patch);
    clearTimeout(t.current);
    const flush = () => { const p = pending.current; pending.current = {}; return rpc("masa_save", { p_token: token, p_patch: p }).catch(() => {}); };
    if (now) return flush();
    t.current = setTimeout(flush, 700);
  };
}

export default function Participant({ token }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const save = useSaver(token);

  async function load() {
    try {
      const me = await rpc("masa_me", { p_token: token });
      if (!me) { setErr("לא מצאנו את המסע הזה. אפשר להיכנס מחדש עם קוד הסדנה."); return; }
      setP(me);
    } catch { setErr("אין חיבור כרגע. נסו לרענן בעוד רגע."); }
  }
  useEffect(() => { load(); }, [token]);

  const update = (patch, now) => { setP((x) => ({ ...x, ...patch })); return save(patch, now); };

  if (err) return <Shell><div className="center"><div className="error">{err} <a href="#/">לכניסה</a></div></div></Shell>;
  if (!p) return <Shell><div className="center"><span className="spin" /></div></Shell>;

  const f = p.form;
  let body;
  if (p.step === "ready") body = <Done p={p} token={token} update={update} />;
  else if (p.step === "making") body = <Making p={p} token={token} onReady={() => update({ step: "ready" })} />;
  else if (p.step === "world") body = <World p={p} token={token} update={update} />;
  else if (p.step === "review") body = <Review p={p} update={update} />;
  else if (!p.mode) body = <Mode p={p} update={update} />;
  else {
    const back = p.workshop?.allow_chat && (
      <button className="back-link no-print" onClick={() => { update({ mode: null }, true); window.scrollTo(0, 0); }}>
        <Icon n="back" size={18} />חזרה לבחירת הדרך
      </button>
    );
    body = <>{back}{p.mode === "chat" ? <Chat p={p} token={token} update={update} /> : <Builder p={p} token={token} update={update} />}</>;
  }

  return <Shell who={p.name} ws={p.workshop?.name} f={f}>{body}</Shell>;
}

function Shell({ children, who, ws }) {
  return (
    <div className="shell">
      <header className="topbar no-print">
        <span className="brand"><img src="./burst.png" alt="" />מפת המסע שלי</span>
        {who && <span className="who">{who}{ws ? ` · ${ws}` : ""}</span>}
      </header>
      <main className="wrap">{children}</main>
    </div>
  );
}

// ---------- בחירת דרך ----------
function Mode({ p, update }) {
  const f = p.form;
  return (
    <>
      <Steps at={0} />
      <h1 className="title">איך נספר את המסע?</h1>
      <p className="lead">{g(f, "בחרי", "בחר")} את הדרך שנוחה לך. בשתיהן המפה יוצאת אותו דבר.</p>
      {(p.stations?.length > 0 || p.chat?.length > 1) && (
        <p className="hint">מה {g(f, "שכתבת", "שכתבת")} עד עכשיו נשמר. אפשר לחזור אליו בכל רגע.</p>
      )}
      <div className="mode-cards">
        <button className="choice mode-card" onClick={() => update({ mode: "build" }, true)}>
          <b>לכתוב תחנה אחרי תחנה</b><span className="hint">כ-15 דקות</span>
          <p>{g(f, "את כותבת", "אתה כותב")} כל תחנה בכרטיס משלה: מה קרה שם ומה {g(f, "לקחת", "לקחת")} משם. מתאים למי {g(f, "שכבר יודעת", "שכבר יודע")} מה התחנות.</p>
        </button>
        <button className="choice mode-card" onClick={() => update({ mode: "chat" }, true)}>
          <b>לספר בשיחה עם מלווה</b><span className="hint">כ-20 דקות</span>
          <p>מלווה שואל שאלה אחת בכל פעם ועוזר למצוא את התחנות. מתאים למי {g(f, "שרוצה", "שרוצה")} לחשוב בקול.</p>
        </button>
      </div>
    </>
  );
}

// ---------- בונה תחנות: ארבעה צעדים קצרים ----------
const KINDS = ["יכולת", "אמונה", "אדם", "תובנה"];
function extraQ(f, i, n, ex) {
  if (ex.hardest === i) return "מה עזר לך לעבור את זה?";
  if (ex.threshold === i) return "מה השארת מאחור כשעברת לשם?";
  if (i === n - 1) return g(f, "מה את מביאה איתך מכל הדרך עד כאן?", "מה אתה מביא איתך מכל הדרך עד כאן?");
  return "מי היה שם בשבילך? (אפשר רק תפקיד, בלי שם)";
}

function Builder({ p, token, update }) {
  const f = p.form;
  const [st, setSt] = useState(p.stations?.length ? p.stations : [EMPTY(), EMPTY(), EMPTY(), EMPTY()]);
  const [ex, setEx] = useState({ side: ["", ""], gear: ["", "", ""], anchor: "", compass: "", threshold: null, hardest: null, bstep: "route", bi: 0, ...(p.extras || {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const setStations = (next) => { setSt(next); update({ stations: next }); };
  const setExtras = (next) => { setEx(next); update({ extras: next }); };
  const go = (bstep, bi = 0) => { setExtras({ ...ex, bstep, bi }); window.scrollTo(0, 0); };
  const edit = (i, k, v) => setStations(st.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i, d) => { const n = [...st]; [n[i], n[i + d]] = [n[i + d], n[i]]; setStations(n); };
  const named = st.filter((s) => s.title.trim());

  async function finish() {
    setBusy(true); setErr("");
    const clean = st.filter((s) => s.title.trim());
    await update({ stations: clean, extras: ex }, true);
    try { await fn("compose", { token }); location.reload(); }
    catch { setErr("לא הצלחנו לסדר את המסע. נסו שוב בעוד רגע."); setBusy(false); }
  }

  // צעד א: הציר
  if (ex.bstep === "route") return (
    <>
      <Steps at={0} />
      <h1 className="title">קודם הדרך כולה</h1>
      <p className="lead">{g(f, "רשמי", "רשום")} רק שם ותקופה לכל תחנה, מהמוקדם למאוחר. את הסיפור נכתוב אחר כך. רוב האנשים בוחרים חמש.</p>
      <div className="trail section">
        {st.map((s, i) => (
          <div className="panel station" key={i} style={{ padding: 14 }}>
            <div className="station-head">
              <span className="num">{i + 1}</span>
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <input className="input" value={s.title} maxLength={40} onChange={(e) => edit(i, "title", e.target.value)}
                  placeholder={i === 0 ? g(f, "למשל: מדריכה בתנועה", "למשל: מדריך בתנועה") : "שם התחנה"} aria-label={`שם תחנה ${i + 1}`} />
                <input className="input" value={s.when} maxLength={30} onChange={(e) => edit(i, "when", e.target.value)}
                  placeholder="למשל: 2009 עד 2012" aria-label={`מתי, תחנה ${i + 1}`} style={{ fontSize: 16, padding: "10px 12px" }} />
              </div>
              <div className="station-tools" style={{ flexDirection: "column" }}>
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="להזיז למעלה"><Icon n="up" /></button>
                <button className="icon-btn" onClick={() => setStations(st.filter((_, j) => j !== i))} disabled={st.length <= 3} aria-label="למחוק תחנה"><Icon n="x" /></button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === st.length - 1} aria-label="להזיז למטה"><Icon n="down" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {st.length < 8 && <button className="add-station" onClick={() => setStations([...st, EMPTY()])}>+ עוד תחנה</button>}
      <div className="sticky-actions no-print"><div className="inner">
        <span className="hint">{named.length < 3 ? `עוד ${3 - named.length} תחנות לפחות` : `${named.length} תחנות`}</span>
        <button className="btn primary" disabled={named.length < 3} onClick={() => { setStations(st.filter((s) => s.title.trim())); go("keys"); }}>הלאה</button>
      </div></div>
    </>
  );

  // צעד ב: רגעי המפתח
  if (ex.bstep === "keys") {
    const Pick = ({ k, q, note }) => (
      <section className="section">
        <h2 style={{ fontSize: 21 }}>{q}</h2>
        {note && <p className="hint" style={{ marginTop: 4 }}>{note}</p>}
        <div className="pills">
          {st.map((s, i) => <button key={i} className={`pill ${ex[k] === i ? "on" : ""}`} aria-pressed={ex[k] === i} onClick={() => setExtras({ ...ex, [k]: ex[k] === i ? null : i })}>{s.title}</button>)}
          <button className={`pill ${ex[k] === -1 ? "on" : ""}`} onClick={() => setExtras({ ...ex, [k]: -1 })}>קשה לי לבחור</button>
        </div>
      </section>
    );
    return (
      <>
        <Steps at={0} />
        <h1 className="title">שני רגעים במסע</h1>
        <p className="lead">שתי נגיעות. מהן המפה יודעת איפה הדרך חוצה גשר ואיפה מזג האוויר משתנה.</p>
        <Pick k="threshold" q="באיזו תחנה חצית סף? רגע שאחריו כבר לא חזרת להיות מי שהיית." />
        <Pick k="hardest" q="איזו תחנה הייתה הכי קשה? (רשות)" note={g(f, "מה שתכתבי נשאר אצלך. במפה יופיעו רק כותרות שתאשרי.", "מה שתכתוב נשאר אצלך. במפה יופיעו רק כותרות שתאשר.")} />
        <div className="sticky-actions no-print"><div className="inner">
          <button className="btn ghost small" onClick={() => go("route")}>חזרה לדרך</button>
          <button className="btn primary" onClick={() => go("station", 0)}>לתחנה הראשונה</button>
        </div></div>
      </>
    );
  }

  // צעד ג: תחנה אחרי תחנה
  if (ex.bstep === "station") {
    const i = Math.min(ex.bi ?? 0, st.length - 1);
    const s = st[i];
    const q = extraQ(f, i, st.length, ex);
    return (
      <>
        <Steps at={0} />
        <p className="hint" style={{ fontWeight: 600, color: "var(--blue)" }}>תחנה {i + 1} מתוך {st.length}</p>
        <h1 className="title" style={{ marginTop: 4 }}>{s.title}</h1>
        {s.when && <p className="lead" style={{ marginTop: 4 }}>{s.when}</p>}
        <section className="panel section">
          <label className="field" style={{ marginTop: 0 }}><span>מה קרה שם?</span>
            <textarea className="textarea" value={s.story || ""} maxLength={600} onChange={(e) => edit(i, "story", e.target.value)}
              placeholder={g(f, "מה עשית, מי היה איתך, רגע אחד שאת זוכרת", "מה עשית, מי היה איתך, רגע אחד שאתה זוכר")} />
          </label>
          <label className="field"><span>מה לקחת משם?</span>
            <input className="input" value={s.took || ""} maxLength={140} onChange={(e) => edit(i, "took", e.target.value)}
              placeholder={g(f, "משהו שאת עושה או מאמינה בו עד היום", "משהו שאתה עושה או מאמין בו עד היום")} />
          </label>
          <div className="pills" style={{ marginTop: 8 }} aria-label="סוג הדבר שלקחת">
            {KINDS.map((k) => <button key={k} className={`pill ${s.kind === k ? "on" : ""}`} style={{ minHeight: 38, fontSize: 15 }} aria-pressed={s.kind === k} onClick={() => edit(i, "kind", s.kind === k ? "" : k)}>{k}</button>)}
          </div>
          <label className="field"><span>{q}</span>
            <input className="input" value={s.extra || ""} maxLength={160} onChange={(e) => setStations(st.map((x, j) => (j === i ? { ...x, extra: e.target.value, extra_q: q } : x)))} />
          </label>
          <p className="hint" style={{ marginTop: 14 }}>{g(f, "עדיף לדבר? לחצי על המיקרופון במקלדת ודברי.", "עדיף לדבר? לחץ על המיקרופון במקלדת ודבר.")}</p>
        </section>
        <div className="sticky-actions no-print"><div className="inner">
          <button className="btn ghost small" onClick={() => (i === 0 ? go("keys") : go("station", i - 1))}>הקודמת</button>
          <button className="btn primary" disabled={!(s.story || "").trim() && !(s.took || "").trim()} onClick={() => (i < st.length - 1 ? go("station", i + 1) : go("side"))}>
            {i < st.length - 1 ? "לתחנה הבאה" : "הלאה"}
          </button>
        </div></div>
      </>
    );
  }

  // צעד ד: לצד הדרך
  return (
    <>
      <Steps at={0} />
      <h1 className="title">ועוד קצת לצד הדרך</h1>
      <p className="lead">הכול רשות. מה שיופיע כאן ייכנס למפה ולסיכום.</p>
      <section className="panel section">
        <div className="field" style={{ marginTop: 0 }}><span>שבילים צדדיים</span><small>תחביב, עיסוק או אהבה שהלכו לצד הדרך הראשית</small>
          <div className="two">
            {[0, 1].map((k) => <input key={k} className="input" maxLength={LIMIT.side} value={ex.side[k] || ""} aria-label={`שביל צדדי ${k + 1}`}
              onChange={(e) => { const s2 = [...ex.side]; s2[k] = e.target.value; setExtras({ ...ex, side: s2 }); }} placeholder={k === 0 ? "למשל: צילום" : "למשל: נגרות"} />)}
          </div>
        </div>
        <div className="field"><span>צידה לדרך</span><small>תארים, הסמכות והכשרות. בעברית, בלי ראשי תיבות באנגלית.</small>
          {[0, 1, 2].map((k) => <input key={k} className="input" maxLength={40} value={ex.gear[k] || ""} aria-label={`צידה לדרך ${k + 1}`}
            onChange={(e) => { const s2 = [...ex.gear]; s2[k] = e.target.value; setExtras({ ...ex, gear: s2 }); }} placeholder={k === 0 ? "למשל: תואר ראשון בחינוך" : ""} />)}
        </div>
        <label className="field"><span>מה החזיק אותך לאורך כל הדרך?</span>
          <input className="input" maxLength={80} value={ex.anchor} onChange={(e) => setExtras({ ...ex, anchor: e.target.value })} placeholder="אדם, ערך, מקום, משפט שחוזר אצלך" />
        </label>
        <label className="field"><span>{g(f, "לאן את הולכת מכאן?", "לאן אתה הולך מכאן?")}</span>
          <input className="input" maxLength={80} value={ex.compass} onChange={(e) => setExtras({ ...ex, compass: e.target.value })}
            placeholder={g(f, "הדבר הבא שאת רוצה לבנות או ללמוד", "הדבר הבא שאתה רוצה לבנות או ללמוד")} />
        </label>
      </section>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="sticky-actions no-print"><div className="inner">
        <button className="btn ghost small" onClick={() => go("station", st.length - 1)}>חזרה</button>
        <button className="btn primary" disabled={busy} onClick={finish}>{busy ? <><span className="spin" /> מסדרים את המסע</> : "לסדר את המסע"}</button>
      </div></div>
    </>
  );
}

// ---------- שיחה עם מלווה ----------
function Chat({ p, token, update }) {
  const f = p.form;
  const [chat, setChat] = useState(p.chat || []);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [composing, setComposing] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef(null);

  async function send(text) {
    setBusy(true); setErr("");
    if (text) setChat((c) => [...c, { role: "user", content: text }]);
    setMsg("");
    try {
      const r = await fn("chat", { token, message: text });
      setChat(r.chat);
      if (r.ready) setReady(true);
    } catch { setErr("המלווה לא ענה. נסו לשלוח שוב."); }
    setBusy(false);
  }
  useEffect(() => { if (!chat.length) send(""); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, busy]);

  const userTurns = chat.filter((m) => m.role === "user").length;
  async function finish() {
    setComposing(true); setErr("");
    try { await fn("compose", { token }); location.reload(); }
    catch { setErr("לא הצלחנו לסדר את המסע. נסו שוב."); setComposing(false); }
  }

  return (
    <>
      <Steps at={0} />
      <h1 className="title">שיחה על הדרך</h1>
      <p className="lead">{g(f, "עני", "ענה")} במילים שלך. אפשר בקצרה. כשיש מספיק, נעבור למפה.</p>
      <div className="chat" aria-live="polite">
        {chat.map((m, i) => <div key={i} className={`bubble ${m.role === "user" ? "me" : "ai"}`}>{m.content}</div>)}
        {busy && <div className="typing">המלווה כותב…</div>}
        <div ref={end} />
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="sticky-actions no-print"><div className="inner" style={{ flexDirection: "column", alignItems: "stretch" }}>
        {(ready || userTurns >= 14) && (
          <button className="btn primary" onClick={finish} disabled={composing}>
            {composing ? <><span className="spin" /> מסדרים את המסע</> : "יש מספיק, לסדר את המסע"}
          </button>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); if (msg.trim() && !busy) send(msg.trim()); }}>
          <textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} rows={1} maxLength={2000}
            placeholder={g(f, "כתבי כאן", "כתוב כאן")} aria-label="תשובה"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (msg.trim() && !busy) send(msg.trim()); } }} />
          <button className="btn primary" disabled={!msg.trim() || busy} aria-label="שליחה"><Icon n="send" /></button>
        </form>
        <button className="btn ghost small" onClick={() => update({ mode: "build" }, true)}>מעדיפים לכתוב לבד? לבונה התחנות</button>
      </div></div>
    </>
  );
}

// ---------- עריכת הכיתוב במפה ----------
function Field({ value, onChange, max, className = "", label }) {
  const len = (value || "").length;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <input className={`input ${className}`} value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className={`count ${len > max ? "over" : ""}`}>{len > max ? `ארוך מדי למפה, ${len}/${max}` : `${len}/${max}`}</span>
    </div>
  );
}

function Review({ p, update }) {
  const f = p.form;
  const [mt, setMt] = useState(p.map_text);
  const set = (next) => { setMt(next); update({ map_text: next }); };
  const st = (i, k, v) => set({ ...mt, stations: mt.stations.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const orig = p.mode === "build" ? (p.stations || []) : [];
  const tooLong = (mt.title || "").length > LIMIT.title || mt.stations.some((s) => s.heading.length > LIMIT.heading || s.sub.length > LIMIT.sub)
    || (mt.side || []).some((s) => s.sub.length > LIMIT.side) || (mt.gear || []).some((x) => x.length > LIMIT.gear);
  const empty = !mt.title?.trim() || mt.stations.some((s) => !s.heading.trim() || !s.sub.trim());

  return (
    <>
      <Steps at={1} />
      <h1 className="title">ככה זה ייכתב על המפה</h1>
      <p className="lead">לכל תחנה יש שם של פרק במסע, ומתחתיו מה זה היה. אפשר לבחור כותרת אחרת בנגיעה או לכתוב לבד. קצר עובד הכי טוב.</p>

      <section className="panel section">
        <label className="field" style={{ marginTop: 0 }}><span>כותרת המפה</span>
          <Field value={mt.title} max={LIMIT.title} onChange={(v) => set({ ...mt, title: v })} label="כותרת המפה" className="heading-in" />
        </label>
        <p className="group-title">התחנות</p>
        {mt.stations.map((s, i) => {
          const opts = [...new Set([s.heading, ...(s.heading_options || [])])].filter(Boolean);
          return (
            <div className="label-row" key={i}>
              <span className="num">{i + 1}</span>
              <div>
                {orig[i]?.title && <p className="hint" style={{ fontSize: 14, marginBottom: 6 }}>{g(f, "כתבת", "כתבת")}: {orig[i].title}</p>}
                <div className="label-fields">
                  <Field value={s.heading} max={LIMIT.heading} onChange={(v) => st(i, "heading", v)} className="heading-in" label={`שם הפרק בתחנה ${i + 1}`} />
                  <Field value={s.sub} max={LIMIT.sub} onChange={(v) => st(i, "sub", v)} label={`מה זה היה בתחנה ${i + 1}`} />
                </div>
                {opts.length > 1 && (
                  <div className="pills" style={{ marginTop: 6 }}>
                    {opts.map((o) => <button key={o} className={`pill ${s.heading === o ? "on" : ""}`} style={{ minHeight: 34, fontSize: 14, padding: "0 12px" }} onClick={() => st(i, "heading", o)}>{o}</button>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {(mt.side || []).length > 0 && <>
          <p className="group-title">שבילים צדדיים</p>
          <div className="two">
            {mt.side.map((s, i) => <Field key={i} value={s.sub} max={LIMIT.side} label={`שביל צדדי ${i + 1}`}
              onChange={(v) => set({ ...mt, side: mt.side.map((x, j) => (j === i ? { ...x, sub: v } : x)) })} />)}
          </div>
        </>}
        {(mt.gear || []).length > 0 && <>
          <p className="group-title">צידה לדרך</p>
          <div style={{ display: "grid", gap: 8 }}>
            {mt.gear.map((x, i) => <Field key={i} value={x} max={LIMIT.gear} label={`צידה לדרך ${i + 1}`}
              onChange={(v) => set({ ...mt, gear: mt.gear.map((y, j) => (j === i ? v : y)) })} />)}
          </div>
        </>}
      </section>

      <div className="sticky-actions no-print"><div className="inner">
        <button className="btn ghost small" onClick={() => update({ step: "story", extras: { ...(p.extras || {}), bstep: "route" } }, true)}>חזרה לסיפור</button>
        <button className="btn primary" disabled={tooLong || empty} onClick={() => update({ step: "world", map_text: mt }, true)}>לבחירת עולם</button>
      </div></div>
    </>
  );
}

// ---------- בחירת עולם ----------
function World({ p, token, update }) {
  const f = p.form;
  const [world, setWorld] = useState(p.world || "");
  const [style, setStyle] = useState(p.style || "storybook");
  const [mood, setMood] = useState(p.mood || "day");
  const [notes, setNotes] = useState(p.notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true); setErr("");
    await update({ world, style, mood, notes }, true);
    try { await fn("generate", { token }); update({ step: "making", map_status: "queued" }); }
    catch { setErr("לא הצלחנו להתחיל. נסו שוב."); setBusy(false); }
  }

  return (
    <>
      <Steps at={2} />
      <h1 className="title">באיזה עולם עובר המסע שלך?</h1>
      <p className="lead">כל מפה שונה. אותו סיפור יכול לעבור בין הרים, באוקיינוס או מעל העננים.</p>
      <div className="worlds" role="radiogroup" aria-label="עולם">
        {WORLDS.map((w) => (
          <button key={w.id} className={`world ${world === w.id ? "on" : ""}`} onClick={() => setWorld(w.id)} aria-pressed={world === w.id}>
            <span className="bg" style={{ backgroundImage: `url(${w.img})` }} />
            <span className="shade" />
            <span className="check"><Icon n="check" /></span>
            <span className="txt"><b>{w.label}</b><small>{w.note}</small></span>
          </button>
        ))}
      </div>
      <section className="section">
        <h2 style={{ fontSize: 20 }}>סגנון הציור</h2>
        <div className="pills">{STYLES.map((s) => <button key={s.id} className={`pill ${style === s.id ? "on" : ""}`} aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</button>)}</div>
      </section>
      <section className="section">
        <h2 style={{ fontSize: 20 }}>האור</h2>
        <div className="pills">{MOODS.map((s) => <button key={s.id} className={`pill ${mood === s.id ? "on" : ""}`} aria-pressed={mood === s.id} onClick={() => setMood(s.id)}>{s.label}</button>)}</div>
      </section>
      <label className="field section"><span>פרט אישי שחשוב לך שיופיע</span>
        <input className="input" maxLength={120} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: הכלב שלי, עץ זית, אופניים" />
        <small>רשות. בלי שמות של אנשים.</small>
      </label>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="sticky-actions no-print"><div className="inner">
        <button className="btn ghost small" onClick={() => update({ step: "review" }, true)}>חזרה לכיתוב</button>
        <button className="btn primary" disabled={!world || busy} onClick={go}>{busy ? <span className="spin" /> : "לצייר את המפה"}</button>
      </div></div>
    </>
  );
}

// ---------- בזמן היצירה: השביל נכתב, והסיפור חוזר אליה ----------
function Making({ p, token, onReady }) {
  const f = p.form;
  const [s, setS] = useState({ map_status: p.map_status || "queued", ahead: 0 });
  const [shown, setShown] = useState(0);
  const heads = (p.map_text?.stations || []).map((x) => x.heading);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fn("status", { token });
        if (!alive) return;
        setS(r);
        if (r.map_status === "ready") { onReady(); return; }
      } catch { /* נמשיך לנסות */ }
      if (alive) setTimeout(tick, 3000);
    };
    tick();
    const t = setInterval(() => setShown((x) => Math.min(x + 1, heads.length)), 1400);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const failed = s.map_status === "failed";
  const sm = p.summary || {};
  return (
    <>
      <Steps at={3} />
      <div className="making">
        <div className="compass" aria-hidden="true" />
        <h1 className="title">{failed ? "משהו נתקע בדרך" : "מציירים את המסע שלך"}</h1>
        <p className="lead" style={{ margin: "10px auto 0" }}>
          {failed ? "אפשר לנסות שוב. המפעיל רואה את זה." :
            s.map_status === "queued" && s.ahead > 0 ? `עוד ${s.ahead} מפות לפנייך בתור, והמפעיל כבר רואה ${g(f, "שאת", "שאתה")} בדרך.` :
              "בערך דקה. בינתיים, זה הסיפור כמו שהוא נשמע מבחוץ."}
        </p>
        {failed && <div className="actions" style={{ justifyContent: "center" }}><button className="btn primary" onClick={async () => { await fn("generate", { token }); location.reload(); }}>לנסות שוב</button></div>}
      </div>
      <ol className="road" aria-label="התחנות">
        {heads.map((h, i) => <li key={i} className={i < shown ? "in" : ""}><span className="num">{i + 1}</span>{h}</li>)}
      </ol>
      {(sm.essence || sm.narrative) && (
        <section className="summary panel" style={{ marginTop: 22 }}>
          {sm.essence && <p className="q" style={{ marginBottom: 12 }}>{sm.essence}</p>}
          {sm.narrative && <p className="narr" style={{ fontSize: 18 }}>{sm.narrative}</p>}
        </section>
      )}
    </>
  );
}

// ---------- מוכנה ----------
function Done({ p, token, update }) {
  const f = p.form;
  const [url, setUrl] = useState(null);
  const [qr, setQr] = useState("");
  const [approved, setApproved] = useState(p.approved);
  const [typo, setTypo] = useState(p.typo_note || "");
  const [typoOpen, setTypoOpen] = useState(false);
  const [sent, setSent] = useState(!!p.typo_note);
  const meUrl = appUrl(`/me/${token}`);
  useEffect(() => {
    fn("map_url", { token }).then((r) => setUrl(r.url)).catch(() => {});
    QRCode.toDataURL(meUrl, { margin: 1, width: 360, color: { dark: "#0a1330" } }).then(setQr);
  }, []);
  const flag = (patch) => rpc("masa_flag", { p_token: token, p_approved: patch.approved ?? null, p_typo: patch.typo ?? null }).catch(() => {});
  const first = p.name.split(" ")[0];
  return (
    <>
      <h1 className="title">המסע של {first}</h1>
      <div className="map-frame section reveal">{url ? <img src={url} alt={`מפת המסע של ${p.name}`} /> : <div className="center" style={{ minHeight: 240 }}><span className="spin" /></div>}</div>
      {p.notes && url && <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>ביקשת שיופיע {p.notes}. מצאת?</p>}

      <section className="panel section">
        {approved ? (
          <p style={{ fontWeight: 600, color: "var(--ok)" }}>אישרת. המפה בדרך למדפסת.</p>
        ) : (
          <>
            <h2 style={{ fontSize: 21 }}>זו המפה שלך?</h2>
            <p className="hint" style={{ marginTop: 4 }}>אות פה ושם יכולה לזוז, זה ציור. אם משהו ממש לא בסדר, {g(f, "ספרי", "ספר")} למפעיל.</p>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => { setApproved(true); flag({ approved: true }); }}>זו המפה שלי, אפשר להדפיס</button>
              <button className="btn" onClick={() => setTypoOpen((x) => !x)}>יש טעות בכיתוב</button>
            </div>
          </>
        )}
        {typoOpen && !sent && (
          <form className="field" onSubmit={(e) => { e.preventDefault(); flag({ typo }); setSent(true); }}>
            <span>מה צריך לתקן?</span>
            <input className="input" value={typo} maxLength={200} onChange={(e) => setTypo(e.target.value)} placeholder="למשל: בתחנה 3 כתוב בטעות..." autoFocus />
            <button className="btn small" disabled={!typo.trim()} style={{ justifySelf: "start", marginTop: 6 }}>לשלוח למפעיל</button>
          </form>
        )}
        {sent && <p className="hint" style={{ marginTop: 10 }}>המפעיל קיבל את ההערה ויחליט אם לצייר מחדש.</p>}
      </section>

      <div className="done-grid">
        {qr && <img className="qr" src={qr} alt="קוד QR לעמוד האישי" />}
        <div>
          <h2 style={{ fontSize: 22 }}>לשמור את המפה אצלך</h2>
          <p className="hint" style={{ marginTop: 6, fontSize: 17 }}>{g(f, "סרקי", "סרוק")} את הקוד או {g(f, "שמרי", "שמור")} את הקישור. שם המפה להורדה בגודל מלא, והסיכום המילולי של המסע.</p>
          <div className="actions" style={{ marginTop: 14 }}>
            <a className="btn primary" href={`#/me/${token}`}>לעמוד האישי</a>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(meUrl)}>העתקת הקישור</button>
          </div>
        </div>
      </div>

      {p.summary && <Summary s={{ ...p.summary, question: null, edge: null }} f={f} />}

      {(p.maps ?? 1) < 2 && !approved && (
        <div className="actions section">
          <button className="btn ghost small" onClick={() => update({ step: "world" }, true)}>לנסות עולם אחר (פעם אחת)</button>
        </div>
      )}

      {p.summary?.question && (
        <section className="last-q">
          <p className="hint">שאלה {g(f, "שתלך איתך", "שתלך איתך")} הלאה</p>
          <p>{p.summary.question}</p>
        </section>
      )}
    </>
  );
}
