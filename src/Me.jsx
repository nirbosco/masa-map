import React, { useEffect, useState } from "react";
import { rpc, fn } from "./api.js";
import { Summary, Icon, downloadPdf } from "./ui.jsx";

export default function Me({ token }) {
  const [p, setP] = useState(null);
  const [map, setMap] = useState(null);
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    rpc("masa_me", { p_token: token }).then((me) => {
      if (!me) { setErr("העמוד הזה לא קיים או שנמחק."); return; }
      setP(me);
      fn("map_url", { token }).then(setMap).catch(() => {});
    }).catch(() => setErr("אין חיבור כרגע. נסו לרענן בעוד רגע."));
  }, [token]);

  if (err) return <div className="center"><div className="error">{err}</div></div>;
  if (!p) return <div className="center"><span className="spin" /></div>;
  const first = p.name.split(" ")[0];

  return (
    <div className="shell">
      <header className="me-head">
        <img src="./burst.png" alt="" style={{ width: 44, margin: "0 auto 14px" }} />
        <h1 className="title">המסע של {first}</h1>
        <p className="lead" style={{ margin: "8px auto 0" }}>{p.workshop?.name}</p>
      </header>
      <main className="me-wrap">
        {map?.url ? (
          <>
            <div className="map-frame"><img src={map.url} alt={`מפת המסע של ${p.name}`} /></div>
            <div className="actions" style={{ justifyContent: "center" }}>
              <a className="btn primary" href={map.download}><Icon n="down2" />תמונה בגודל מלא</a>
              <button className="btn" disabled={pdfBusy} onClick={async () => { setPdfBusy(true); try { await downloadPdf(map.url, `מפת-המסע-${p.name}`); } finally { setPdfBusy(false); } }}>
                {pdfBusy ? <span className="spin" /> : <Icon n="print" />}קובץ להדפסה A3
              </button>
            </div>
          </>
        ) : (
          <div className="panel" style={{ textAlign: "center" }}><p className="lead" style={{ margin: "0 auto" }}>המפה עוד בדרך. כדאי לחזור לכאן בעוד כמה דקות.</p></div>
        )}
        <div className="me-text section"><Summary s={p.summary} f={p.form} /></div>
      </main>
      <footer className="foot"><img src="./hotam-logo.png" alt="חותם" /></footer>
    </div>
  );
}
