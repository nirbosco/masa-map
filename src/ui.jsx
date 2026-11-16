import React from "react";
import { g } from "./api.js";

const P = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  x: "M6 6l12 12M18 6L6 18",
  send: "M20 12L4 4l3 8-3 8 16-8zM7 12h13",
  check: "M5 12.5l4.5 4.5L19 7",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  down2: "M12 3v12m0 0l-5-5m5 5l5-5M4 21h16",
  redo: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z",
  warn: "M12 3l10 18H2L12 3zm0 7v5m0 3v.5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
};
export function Icon({ n, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}

export function Summary({ s, f }) {
  if (!s) return null;
  return (
    <section className="summary">
      <h2 style={{ fontSize: 26, marginBottom: 12 }}>הסיפור של הדרך</h2>
      {s.essence && <p className="q" style={{ marginBottom: 14 }}>{s.essence}</p>}
      {s.narrative && <p className="narr">{s.narrative}</p>}
      {s.threads?.length > 0 && <>
        <h3>מה חוזר לאורך הדרך</h3>
        <ul>{s.threads.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </>}
      <div className="kv">
        {s.anchor && <div><h3>העוגן</h3><p>{s.anchor}</p></div>}
        {s.compass && <div><h3>המצפן</h3><p>{s.compass}</p></div>}
      </div>
      {s.edge && <>
        <h3>מה כדאי לשים לב אליו</h3>
        <p>{s.edge}</p>
      </>}
      {s.question && <>
        <h3>שאלה {g(f, "שתלך איתך", "שתלך איתך")} הלאה</h3>
        <p className="q">{s.question}</p>
      </>}
    </section>
  );
}

// הדפסה ב-A3 לרוחב: חלון נפרד עם התמונה בלבד
export function printA3(url, title = "מפת המסע") {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html dir="rtl"><head><title>${title}</title><style>
    @page { size: A3 landscape; margin: 0 }
    html,body { margin:0; height:100%; background:#fff }
    body { display:flex; align-items:center; justify-content:center }
    img { width:100vw; height:100vh; object-fit:contain }
  </style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},300)"></body></html>`);
  w.document.close();
  return true;
}

// PDF בגודל A3, מתמונה ברזולוציה מלאה
export async function downloadPdf(url, name) {
  const { jsPDF } = await import("jspdf");
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  const data = c.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const W = 420, H = 297, r = img.naturalWidth / img.naturalHeight;
  let w = W, h = W / r;
  if (h > H) { h = H; w = H * r; }
  pdf.addImage(data, "JPEG", (W - w) / 2, (H - h) / 2, w, h);
  pdf.save(`${name}.pdf`);
}
