import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { rpc, fn, appUrl } from "./api.js";
import { Icon, printA3 } from "./ui.jsx";
import { WORLDS } from "./Participant.jsx";

const STEP_LABEL = { story: "כותבים את הסיפור", review: "עורכים את הכיתוב", world: "בוחרים עולם" };
function statusOf(p) {
  if (p.map_status === "failed") return { key: "draw", label: "תקלה בציור", cls: "bad" };
  if (p.map_status === "queued") return { key: "draw", label: "בתור לציור", cls: "blue" };
  if (["generating", "checking", "fixing"].includes(p.map_status)) return { key: "draw", label: "מציירים עכשיו", cls: "blue" };
  if (p.map_status === "ready" || p.map_status === "review") {
    if (p.print_status === "printed") return { key: "printed", label: "הודפסה", cls: "ok" };
    return { key: "print", label: "מוכנה להדפסה", cls: "warn" };
  }
  return { key: "write", label: STEP_LABEL[p.step] ?? "בכתיבה", cls: "" };
}
const FILTERS = [
  { key: "all", label: "כולם" },
  { key: "write", label: "בכתיבה" },
  { key: "draw", label: "בציור" },
  { key: "print", label: "מחכות להדפסה" },
  { key: "printed", label: "הודפסו" },
];

function labelsList(mt) {
  if (!mt) return [];
  const out = [mt.title];
  (mt.stations || []).forEach((s, i) => out.push(`${i + 1}. ${s.heading} · ${s.sub}`));
  (mt.side || []).forEach((s) => out.push(`נתיב · ${s.sub}`));
  if ((mt.gear || []).length) out.push(`צידה לדרך · ${mt.gear.join(" · ")}`);
  return out;
}

export default function Operator({ adminKey }) {
  const [data, setData] = useState(null);
  const [urls, setUrls] = useState({});
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [proj, setProj] = useState(false);
  const [err, setErr] = useState("");
  const sig = useRef("");

  async function load() {
    try {
      const d = await rpc("masa_admin_list", { p_admin: adminKey });
      setData(d); setErr("");
      const s = d.people.filter((p) => p.has_map).map((p) => p.id + p.status_at).join("|");
      if (s && s !== sig.current) { sig.current = s; setUrls(await fn("admin_urls", { admin: adminKey })); }
    } catch (e) { setErr(String(e.message).includes("not allowed") ? "הקישור לעמדה לא תקין." : "אין חיבור. מנסים שוב…"); }
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [adminKey]);

  const people = data?.people ?? [];
  const counts = useMemo(() => {
    const c = { all: people.length, write: 0, draw: 0, print: 0, printed: 0 };
    people.forEach((p) => { c[statusOf(p).key]++; });
    return c;
  }, [people]);
  const shown = people.filter((p) => filter === "all" || statusOf(p).key === filter)
    .sort((a, b) => (statusOf(a).key === "print" ? -1 : 0) - (statusOf(b).key === "print" ? -1 : 0));

  async function setPrint(p, v) { await rpc("masa_admin_update", { p_admin: adminKey, p_id: p.id, p_patch: { print_status: v } }); load(); }
  async function doPrint(p) {
    const u = urls[p.id]?.view; if (!u) return;
    printA3(u, `מפת המסע של ${p.name}`);
    await setPrint(p, "printed");
  }
  async function regen(p) {
    if (!confirm(`לצייר מחדש את המפה של ${p.name}? המפה הנוכחית תוחלף.`)) return;
    await fn("admin_regenerate", { admin: adminKey, id: p.id }); setOpen(null); load();
  }
  async function del(p) {
    if (!confirm(`למחוק את ${p.name} מהסדנה? אי אפשר לשחזר.`)) return;
    await rpc("masa_admin_delete", { p_admin: adminKey, p_id: p.id }); setOpen(null); load();
  }
  async function toggleOpen() { await rpc("masa_admin_workshop", { p_admin: adminKey, p_patch: { is_open: !data.workshop.is_open } }); load(); }

  if (err && !data) return <div className="center"><div className="error">{err}</div></div>;
  if (!data) return <div className="center"><span className="spin" /></div>;
  const ws = data.workshop;
  const capHit = people.some((p) => /spending cap|RESOURCE_EXHAUSTED|429/.test(p.error || ""));
  const cur = open && people.find((p) => p.id === open);

  return (
    <div className="op">
      <header className="op-top">
        <img src="./burst.png" alt="" style={{ width: 28 }} />
        <h1>{ws.name}</h1>
        <span className="code" title="קוד הצטרפות">{ws.code}</span>
        {!ws.is_open && <span className="chip bad">סגורה להצטרפות</span>}
        <span className="grow" />
        {err && <span className="chip warn">{err}</span>}
        <button className="btn small" onClick={() => setProj(true)}><Icon n="qr" />מסך הצטרפות</button>
        <button className="btn small ghost" onClick={toggleOpen}>{ws.is_open ? "לסגור הצטרפות" : "לפתוח הצטרפות"}</button>
      </header>

      <main className="op-main">
        {capHit && (
          <div className="error" role="alert" style={{ marginTop: 0, marginBottom: 14 }}>
            הציור נעצר: נגמר תקציב החודש בחשבון Gemini, או שיש עומס זמני אצל גוגל. צריך להגדיל את תקרת ההוצאה ב-AI Studio (ai.studio/spend), ואז ללחוץ "לצייר מחדש" אצל מי שנתקע.
          </div>
        )}
        <div className="stats" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={`stat ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>
              <b>{counts[f.key]}</b><span>{f.label}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="empty">{people.length === 0 ? <>עוד אין משתתפים. אפשר להקרין את <button className="btn small" onClick={() => setProj(true)}>מסך ההצטרפות</button></> : "אין כאן אף אחד כרגע."}</div>
        ) : (
          <div className="grid">
            {shown.map((p) => {
              const s = statusOf(p);
              const u = urls[p.id]?.view;
              return (
                <article className="pcard" key={p.id}>
                  <div className="thumb" onClick={() => u && setOpen(p.id)} role={u ? "button" : undefined} aria-label={u ? `לפתוח את המפה של ${p.name}` : undefined}>
                    {u && p.has_map ? <img src={u} alt="" loading="lazy" /> : <span>{s.key === "draw" ? "המפה בציור…" : "עוד אין מפה"}</span>}
                    {p.check_result?.flag && <span className="chip warn flag" title="בדיקה אוטומטית: יתכן שחסרה תווית או שיש טקסט משובש"><Icon n="warn" size={14} /> כדאי להציץ</span>}
                  </div>
                  <div className="body">
                    <div className="row"><span className="name">{p.name}</span><span className={`chip ${s.cls}`}>{s.label}</span></div>
                    {p.world && <span className="meta">{WORLDS.find((w) => w.id === p.world)?.label}</span>}
                    {p.has_map && p.approved && <span className="chip ok" style={{ width: "fit-content" }}>אישרה להדפסה</span>}
                    {p.typo_note && <span className="chip bad" style={{ width: "fit-content", whiteSpace: "normal" }} title={p.typo_note}>דיווח על טעות: {p.typo_note}</span>}
                    {p.map_status === "failed" && (
                      <button className="btn small" style={{ justifySelf: "start" }} onClick={async () => { await fn("admin_regenerate", { admin: adminKey, id: p.id }); load(); }}><Icon n="redo" size={18} />לצייר מחדש</button>
                    )}
                    {p.has_map && (
                      <div className="btns">
                        <button className="btn small primary" onClick={() => doPrint(p)}><Icon n="print" size={18} />הדפסה</button>
                        <button className="btn small" onClick={() => setOpen(p.id)}><Icon n="eye" size={18} />צפייה</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {cur && (
        <div className="viewer" role="dialog" aria-label={`המפה של ${cur.name}`} onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
          <div className="stage" onClick={() => setOpen(null)}>{urls[cur.id]?.view && <img src={urls[cur.id].view} alt="" onClick={(e) => e.stopPropagation()} />}</div>
          <aside>
            <div className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>{cur.name}</h2>
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label="סגירה" autoFocus><Icon n="x" /></button>
            </div>
            <span className={`chip ${statusOf(cur).cls}`} style={{ justifySelf: "start", width: "fit-content" }}>{statusOf(cur).label}</span>
            {cur.map_status === "failed" && cur.error && <div className="error" style={{ marginTop: 0 }}>הציור נכשל: {/spending cap/.test(cur.error) ? "נגמר תקציב החודש ב-Gemini" : cur.error.slice(0, 140)}</div>}
            {cur.typo_note && <div className="error" style={{ marginTop: 0 }}>המשתתף/ת דיווח/ה על טעות: {cur.typo_note}</div>}
            {cur.approved && <span className="chip ok" style={{ width: "fit-content" }}>אושרה להדפסה</span>}
            {cur.check_result?.flag && (
              <div className="error" style={{ background: "var(--warn-bg)", color: "var(--warn)", marginTop: 0 }}>
                הבדיקה האוטומטית חושדת: {cur.check_result.gross.map((x) => x.expected || x.seen).slice(0, 3).join(", ")}. אם המפה נראית בסדר, אפשר להדפיס.
              </div>
            )}
            <div className="btns" style={{ display: "grid", gap: 8 }}>
              <button className="btn primary" onClick={() => doPrint(cur)}><Icon n="print" />הדפסה A3</button>
              {urls[cur.id]?.download && <a className="btn" href={urls[cur.id].download}><Icon n="down2" />הורדת הקובץ</a>}
              {cur.print_status === "printed"
                ? <button className="btn ghost" onClick={() => setPrint(cur, "none")}>לבטל סימון הודפסה</button>
                : <button className="btn ghost" onClick={() => setPrint(cur, "printed")}>לסמן שהודפסה</button>}
            </div>
            <div>
              <p className="group-title" style={{ marginTop: 6 }}>מה אמור להיות כתוב</p>
              <div className="labels">{labelsList(cur.map_text).map((l, i) => <span key={i}>{l}</span>)}</div>
            </div>
            <div className="btns" style={{ display: "grid", gap: 8, marginTop: "auto" }}>
              <button className="btn small" onClick={() => regen(cur)}><Icon n="redo" size={18} />לצייר מחדש</button>
              <button className="btn small danger" onClick={() => del(cur)}><Icon n="trash" size={18} />למחוק משתתף</button>
            </div>
          </aside>
        </div>
      )}

      {proj && <Projector code={ws.code} name={ws.name} onClose={() => setProj(false)} />}
    </div>
  );
}

function Projector({ code, name, onClose }) {
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(appUrl(`/j/${code}`), { margin: 1, width: 700, color: { dark: "#0a1330" } }).then(setQr); }, [code]);
  return (
    <div className="projector" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button className="btn small close" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.6)" }} onClick={onClose} autoFocus>סגירה</button>
      <div>
        <h2>מפת המסע שלי</h2>
        <p style={{ fontSize: "clamp(18px,2.4vw,28px)", opacity: .9, marginTop: 8 }}>{name}</p>
        {qr && <img className="qrbig" src={qr} alt="קוד QR להצטרפות" />}
        <p style={{ fontSize: "clamp(18px,2.2vw,26px)" }}>סורקים, או נכנסים לאתר ומקלידים את הקוד</p>
        <div className="big-code">{code}</div>
      </div>
    </div>
  );
}
