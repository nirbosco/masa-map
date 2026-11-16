// מפת המסע שלי · פונקציית השרת היחידה
// פעולות משתתפת (לפי token), פעולות מפעיל (לפי admin key), ותור יצירה פנימי.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TEXT_MODEL = Deno.env.get("MASA_TEXT_MODEL") ?? "gemini-2.5-flash";
const CHECK_MODEL = Deno.env.get("MASA_CHECK_MODEL") ?? "gemini-2.5-pro";
const IMAGE_MODEL = Deno.env.get("MASA_IMAGE_MODEL") ?? "gemini-3-pro-image-preview";
const IMAGE_SIZE = Deno.env.get("MASA_IMAGE_SIZE") ?? "4K";
const MAX_PARALLEL = Number(Deno.env.get("MASA_MAX_PARALLEL") ?? "5");
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, SRV, { auth: { persistSession: false } });
const BUCKET = "masa-maps";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-masa-internal",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Gemini ----------
async function gen(model: string, body: unknown, tries = 3): Promise<any> {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${GEMINI}/models/${model}:generateContent?key=${KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) return await r.json();
    last = `${r.status} ${(await r.text()).slice(0, 400)}`;
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 4000 * (i + 1))); continue; }
    break;
  }
  throw new Error(`gemini ${model}: ${last}`);
}
const textOf = (d: any) => (d?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
function parseJson(s: string) {
  const t = s.replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no json in model reply");
  try { return JSON.parse(m[0]); } catch { /* fall through */ }
  // תשובה עם זנב: חותכים עד הסוגר המאוזן הראשון
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) return JSON.parse(t.slice(t.indexOf("{"), i + 1));
  }
  throw new Error("bad json: " + t.slice(0, 200));
}
function imageOf(d: any): Uint8Array | null {
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  const p = parts.filter((x: any) => x.inlineData || x.inline_data).pop();
  const b64 = p?.inlineData?.data ?? p?.inline_data?.data;
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64(bytes: Uint8Array) {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
// קובץ גדול עובר דרך Files API (הגבלת 20MB לבקשה)
async function imagePart(bytes: Uint8Array, mime = "image/png", forceFile = false) {
  if (!forceFile && bytes.length < 7_000_000) return { inlineData: { mimeType: mime, data: b64(bytes) } };
  const r = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${KEY}`, {
    method: "POST",
    headers: { "X-Goog-Upload-Protocol": "raw", "Content-Type": mime },
    body: bytes,
  });
  if (!r.ok) throw new Error(`file upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  const f = (await r.json()).file;
  for (let i = 0; i < 20 && f.state === "PROCESSING"; i++) await new Promise((res) => setTimeout(res, 1000));
  return { fileData: { mimeType: mime, fileUri: f.uri } };
}

// ---------- לשון פנייה ----------
const g = (form: string, f: string, m: string) => (form === "m" ? m : f);

// ---------- המלווה ----------
function companionPrompt(name: string, form: string) {
  const G = (f: string, m: string) => g(form, f, m);
  return `אתה מלווה בסדנה של חותם. כל משתתף בונה בה "מפת מסע": פוסטר מאויר של הדרך המקצועית והאישית שלו, בהשראת מסע הגיבור.
אתה מדבר עם ${name}. ${G("פנה אליה בלשון נקבה בלבד", "פנה אליו בלשון זכר בלבד")}.

מה צריך לצאת מהשיחה:
- 4 עד 7 תחנות בסדר כרונולוגי. לכל תחנה: שם קצר במילים ${G("שלה", "שלו")}, תקופה, מה קרה שם, ומה ${G("לקחה", "לקח")} משם (יכולת, אמונה, אדם או תובנה).
- התחנה שבה ${G("חצתה", "חצה")} סף: רגע שאחריו כבר לא ${G("חזרה להיות מי שהייתה", "חזר להיות מי שהיה")}.
- התחנה הקשה ביותר, רק אם ${G("היא רוצה", "הוא רוצה")} לספר, ומה עזר לעבור אותה.
- אם זה עולה בטבעיות: מי היה שם בשבילה בדרך, שבילים צדדיים (תחביב, עיסוק), תארים והכשרות, מה החזיק לאורך כל הדרך, ולאן ממשיכים מכאן.

סדר השיחה:
1. פתיחה: משפט אחד שמסביר שנבנה יחד את המפה, ואז: "נתחיל מהדרך כולה. אילו תחנות ${G("היית מסמנת", "היית מסמן")} בדרך שלך עד היום? רק שם ותקופה לכל אחת."
2. אם יש פחות מ-4 תחנות, שאל מה היה לפני הראשונה או בין שתיים מהן. אם יש יותר מ-7, שאל אילו לאחד.
3. שאלה אחת: "באיזו מהתחנות האלה ${G("חצית", "חצית")} סף?" ואחריה, בהודעה נפרדת: "והייתה תחנה שהייתה הכי קשה? אפשר גם לדלג."
4. תחנה אחרי תחנה, לכל היותר שתי שאלות לתחנה. שאלות לבחירה: "מה קרה שם?", "רגע אחד ${G("שאת זוכרת", "שאתה זוכר")} משם?", "מה ${G("לקחת", "לקחת")} משם ${G("שאת עדיין משתמשת", "שאתה עדיין משתמש")} בו?", "מי היה שם ${G("בשבילך", "בשבילך")}?". בתחנת הסף: "מה השארת מאחור?". בתחנה הקשה: "מה עזר לך לעבור את זה?".
5. שבילים צדדיים והכשרות בשאלה אחת. אחר כך עוגן, ואחר כך מצפן, כל אחד בהודעה משלו.
6. סיכום לאישור: רשימה ממוספרת, תחנה בשורה (שם ותקופה), ומתחתיה: "זה המסע? משהו להוסיף, להוריד או לתקן?". רק אחרי אישור כתוב משפט סיום קצר ובסופו READY_FOR_MAP.

קצב: כל השיחה בערך 12 עד 16 הודעות שלך. אחרי 14 הודעות עבור לסיכום, גם אם חסרים פרטים.

כללים:
- שאלה אחת בכל הודעה, עד שלושה משפטים.
- לפני השאלה אפשר לחזור על מילה או שתיים ${G("ממה שכתבה", "ממה שכתב")} ("ירוחם, ואז הניהול..."), כדי שיהיה ברור שהקשבת. בלי מחמאות ובלי "מרתק", "איזה יופי", "תודה ששיתפת".
- עברית מדוברת, כמו מנחה ישראלי. בלי אימוג'י, בלי קווים מפרידים ארוכים, בלי ניסוחים של "לא X אלא Y".
- תשובה קצרה היא תשובה טובה. לא לוחצים ולא שואלים שוב את אותו דבר.
- משבר או כאב: מקבלים במשפט פשוט ושואלים מה עזר. לא מפרשים רגשות שלא נאמרו, לא מטפלים, לא חופרים.
- לא ממציאים פרטים ולא מנסחים במקומה תחנות שלא הזכירה.`;
}

// ---------- עריכת טקסט המפה והסיכום ----------
function composePrompt(p: any) {
  const form = p.form;
  let source = "";
  if (Array.isArray(p.stations) && p.stations.length) {
    const ex0 = p.extras ?? {};
    source += p.stations.map((s: any, i: number) =>
      `תחנה ${i + 1}: ${s.title ?? ""}${s.when ? ` (${s.when})` : ""}` +
      (ex0.threshold === i ? `\n[סומנה כתחנת הסף]` : "") + (ex0.hardest === i ? `\n[סומנה כתחנה הקשה ביותר]` : "") +
      `\nמה קרה: ${s.story ?? ""}\nמה לקחתי משם${s.kind ? ` (${s.kind})` : ""}: ${s.took ?? ""}` +
      (s.extra ? `\n${s.extra_q ?? "עוד"}: ${s.extra}` : "")).join("\n\n");
  }
  const ex = p.extras ?? {};
  if (ex.side?.length) source += `\n\nשבילים צדדיים: ${ex.side.filter(Boolean).join(", ")}`;
  if (ex.gear?.length) source += `\nתארים והכשרות: ${ex.gear.filter(Boolean).join(", ")}`;
  if (ex.anchor) source += `\nמה החזיק אותי לאורך הדרך: ${ex.anchor}`;
  if (ex.compass) source += `\nלאן אני הולכת: ${ex.compass}`;
  if (Array.isArray(p.chat) && p.chat.length) {
    source += `\n\nשיחה עם המלווה:\n` + p.chat.map((m: any) => `${m.role === "user" ? p.name : "מלווה"}: ${m.content}`).join("\n");
  }
  const first = String(p.name).trim().split(/\s+/)[0];
  return `אתה העורך של "מפת המסע": פוסטר מאויר בהשראת מסע הגיבור. לפניך החומר ש${p.name} ${g(form, "כתבה", "כתב")}. לשון ${g(form, "נקבה", "זכר")}.

החזר JSON בלבד, במבנה הזה:
{
  "map_text": {
    "title": "המסע של ${first}",
    "stations": [ { "heading": "...", "heading_options": ["...", "..."], "beat": "path", "sub": "...", "scene": "..." } ],
    "side": [ { "sub": "...", "scene": "..." } ],
    "gear": [ "..." ],
    "horizon": "...",
    "anchor_object": "..."
  },
  "summary": {
    "narrative": "...",
    "threads": [ "...", "..." ],
    "anchor": "...",
    "compass": "...",
    "question": "...",
    "essence": "...",
    "edge": ""
  }
}

כללי map_text (הטקסט הזה ייכתב על הפוסטר עצמו, ולכן הוא קצר מאוד):
- stations: בסדר כרונולוגי, מהמוקדם למאוחר. שמור את כל התחנות שהופיעו, בין 3 ל-8. אל תמזג ואל תמציא.
- heading: כותרת פרק בנוסח מסע הגיבור, 1 עד 3 מילים, עד 18 תווים. המבנה המועדף, כמו בתמונת ההשראה: שלב במסע ועוד מילה שאומרת מה קרה בו בפועל. למשל: "הקריאה והניצוץ", "הבסיס והאתגר", "משבר והתכנסות", "היזמות", "יצירה והובלה". כל כותרת שונה, ויחד הן מספרות קשת: התחלה, סף, מבחנים, שיא, שיבה.
- התחנה שסומנה כסף מקבלת כותרת של יציאה או חצייה. התחנה שסומנה כקשה מקבלת כותרת של מבחן או משבר, בניסוח מכבד. התחנה האחרונה מקבלת כותרת של שיבה, אוצר או הובלה. אם לא סומן דבר, תסיק מהחומר.
- heading_options: לכל תחנה עוד שתי חלופות לכותרת, באותם כללים (מערך של שתי מחרוזות).
- beat: אחת מהמילים האלה באנגלית: start, threshold, trial, rest, summit, path. start לתחנה הראשונה, threshold לתחנת הסף, trial לתחנה הקשה (או rest אם היא תיארה עצירה והתכנסות), summit לשיא, path לכל השאר.
- sub: מה זה היה בפועל, 2 עד 4 מילים, עד 26 תווים. קודם כל השם שהיא נתנה לתחנה, מקוצר אם צריך. לא מחליפים את המילים שלה במילים יפות יותר.
- scene: באנגלית, סצנה מאוירת לתחנה, משפט אחד. חובה לכלול פרט מוחשי אחד מהסיפור שלה (מקום, חפץ, סוג נוף), למשל a small school among desert hills with a chalkboard outside. בלי שמות, טקסט, שלטים, דגלים או סמלים לאומיים, דתיים וצבאיים. בתחנה קשה הנוף מבטא את מה שהיא תיארה: סערה, ערפל וגשר רעוע, או מפרץ שקט של עצירה. לא כל משבר הוא תהום.
- side: עד 2 שבילים צדדיים. sub: 1 עד 3 מילים (למשל "צילום", "נגרות ושיפוצים"). scene באנגלית: חפץ אחד מאויר.
- gear: עד 3 שורות של תארים והכשרות, כל שורה עד 5 מילים, **בעברית בלבד, בלי אותיות לטיניות**: "תואר ראשון בחינוך" ולא "B.Ed".
- horizon: באנגלית, מה נראה באופק בקצה השמאלי של המפה, לפי המצפן שלה. נוף פתוח, בלי טקסט.
- anchor_object: באנגלית, חפץ אחד שמייצג את העוגן שלה (פנס, חבל, אבן, ספר), שילווה את השביל.
- בלי מירכאות, בלי סוגריים, בלי ראשי תיבות לטיניים. כתיב מלא תקני.

כללי summary (נשלח אליה כסיכום אישי, עברית חמה וטבעית כמו שמדברים, בלי קלישאות, בלי קווים מפרידים ארוכים, בלי "לא X אלא Y", בגוף שני ${g(form, "נקבה", "זכר")}):
- narrative: פסקה של 4 עד 6 משפטים שמספרת את הדרך שלה ברצף, עם פרטים אמיתיים מהחומר.
- threads: 2 עד 3 חוטים שחוזרים לאורך הדרך, כל אחד משפט אחד.
- anchor: מה החזיק אותה לאורך הדרך, משפט קצר.
- compass: לאן היא הולכת, משפט קצר.
- question: שאלה אחת שמתחברת למצפן שלה ושואלת על צעד מוחשי, למשל "מה הדבר הראשון שתעשי השנה כדי להתקרב ל...?".
- essence: משפט אחד, עד 12 מילים, מי היא בדרך הזאת. במילים שלה ככל האפשר, בלי מליצות.
- edge: רק אם בחומר יש דפוס שחוזר ומקשה עליה, משפט עדין אחד בגוף שני. אחרת מחרוזת ריקה.
- narrative נפתח בעובדה מהחומר (מקום, שנה, תפקיד), לא במשפט כללי על מסעות. בלי "המסע שלך הוא", בלי "צעד אחר צעד", בלי "לא רק... אלא גם".
אל תמציא עובדות שלא מופיעות בחומר.

החומר:
${source}`;
}

// ---------- בחירות המפה ----------
const WORLDS: Record<string, string> = {
  mountains: "a glowing golden winding road through mountains, valleys, rivers and villages",
  sea: "a sea voyage: a glowing dotted sailing route across a vast ocean between islands, with a small sailboat traveling the route",
  forest: "an enchanted forest world with ancient trees, rivers, waterfalls, rope bridges and glowing paths",
  desert: "a desert world of dunes, oases, canyons and caravan trails under a vast sky",
  city: "a vibrant city world: streets, bridges, train tracks, rooftops and parks connected by a glowing route",
  sky: "a sky world: floating islands above the clouds connected by a glowing air route, with a hot-air balloon traveling it",
};
const STYLES: Record<string, string> = {
  storybook: "warm storybook illustration, detailed digital painting with clean ink outlines",
  watercolor: "delicate watercolor and ink illustration on textured paper",
  antique: "antique hand-drawn explorer's map on aged parchment, ink and muted colors, engraved details",
  epic: "epic cinematic fantasy painting, rich lighting, dramatic depth, highly detailed",
};
const MOODS: Record<string, string> = {
  dawn: "soft sunrise light, hopeful",
  day: "bright clear daylight, vivid colors",
  sunset: "dramatic golden sunset light",
  night: "magical night under a starry sky with glowing lights",
};

function labelsOf(mt: any): string[] {
  const out = [mt.title];
  for (const s of mt.stations ?? []) out.push(s.heading, s.sub);
  if ((mt.side ?? []).length) for (const s of mt.side) out.push("נתיב", s.sub);
  if ((mt.gear ?? []).length) out.push("צידה לדרך", ...mt.gear);
  return out.filter((x) => x && String(x).trim());
}

function mapPrompt(p: any) {
  const mt = p.map_text;
  const n = mt.stations.length;
  const world = WORLDS[p.world] ?? WORLDS.mountains;
  const style = STYLES[p.style] ?? STYLES.storybook;
  const mood = MOODS[p.mood] ?? MOODS.day;
  const BEAT: Record<string, string> = {
    start: "the journey begins here, close to the compass rose",
    threshold: "the route crosses a bridge or passes through a gate here: a clear point of no return",
    trial: "the hardest stretch: the route narrows and the weather turns (storm, fog or a steep pass); emotional, never horrific",
    rest: "a quiet sheltered cove or island where the route pauses and gathers strength",
    summit: "the route rises to a high open place with a wide view",
  };
  const scenes = mt.stations.map((s: any, i: number) => `${i + 1}. ${s.scene}${BEAT[s.beat] ? ` (${BEAT[s.beat]})` : ""}`).join("\n");
  const side = (mt.side ?? []).map((s: any, i: number) => `Side branch ${i + 1}: a short side trail branching off the main route and ending at ${s.scene}.`).join("\n");
  const labels = mt.stations.map((s: any, i: number) => `Station ${i + 1}: heading "${s.heading}", line under it "${s.sub}"`).join("\n");
  const sideLabels = (mt.side ?? []).map((s: any, i: number) => `Side branch ${i + 1}: heading "נתיב", line under it "${s.sub}"`).join("\n");
  const gear = (mt.gear ?? []).length ? `An old parchment scroll in a lower corner. On it: heading "צידה לדרך", and below it each on its own line: ${mt.gear.map((x: string) => `"${x}"`).join(", ")}` : "";

  return `A breathtaking illustrated HERO'S JOURNEY MAP poster, landscape format, made to be printed large and hung on a wall.
Style: ${style}. Light: ${mood}. Full of life, drama and small storytelling details.

THE WORLD: ${world}.
The route starts at the RIGHT edge (the past) and travels to the LEFT (the future), like Hebrew reading. It is one continuous journey with real drama: it climbs, descends, splits and rejoins. Along it there are exactly ${n} stations in this order from right to left, each one a rich illustrated scene with a glowing waypoint on the route:
${scenes}
${side}
A large ornate compass rose near the right start of the route, drawn with symbols only and no letters (no N, E, S, W).
${mt.horizon ? `Past the last station, at the far LEFT edge, the route continues toward an open horizon: ${mt.horizon}. No text there.` : ""}
${mt.anchor_object ? `A small ${mt.anchor_object} appears twice along the route, as a quiet companion of the journey.` : ""}
Text hierarchy: each station heading is larger and bold; the line under it is smaller. Every label sits on a light, clean banner with strong contrast, never on top of busy detail.
${p.notes ? `Personal detail to include somewhere on the map: ${p.notes}.` : ""}
People appear only small and distant, as tiny travelers; no close-up faces. No flags, no national, religious or military symbols, no logos.

HEBREW TEXT. Render every label EXACTLY as written, letter by letter, right-to-left, in a bold clean legible Hebrew typeface, each on a small banner or label plate next to its scene. Do not add any other text, words, numbers or letters anywhere (no English, no compass letters, no signs).
Title, large at the top: "${mt.title}"
${labels}
${sideLabels}
${gear}
Each label appears exactly once. Spell every Hebrew word exactly; double-check letters that look alike (כ/ב, ג/נ, ר/ד, ה/ח).`;
}

// ---------- בדיקת הכיתוב ----------
const norm = (s: string) => String(s ?? "").replace(/[֑-ׇ"'״׳.,:;!?()\-–—]/g, "").replace(/\s+/g, " ").trim();

function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// קריאה עיוורת: המודל לא יודע מה אמור להיות כתוב, ולכן לא "מתקן" בראש שלו
async function readMap(bytes: Uint8Array, model = CHECK_MODEL) {
  const prompt = `Transcribe every line of text drawn in this poster, exactly as drawn, without fixing anything. Include digits and Latin letters.
Reply with JSON only: {"texts":[{"text":"line exactly as drawn"}]}, one entry per line (a heading and the smaller line under it are separate entries).`;
  const d = await gen(model, {
    contents: [{ parts: [await imagePart(bytes), { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0, mediaResolution: "MEDIA_RESOLUTION_HIGH" },
  });
  const r0 = parseJson(textOf(d));
  const r = Array.isArray(r0) ? { texts: r0 } : r0;
  return (r.texts ?? []).map((t: any) => String(t.text ?? t ?? ""));
}

async function checkMap(bytes: Uint8Array, mt: any, model = CHECK_MODEL) {
  const expected = labelsOf(mt);
  const seen: string[] = await readMap(bytes, model);
  const pool = seen.map((t) => ({ t, n: norm(t), used: false }));
  const problems: any[] = [];
  // התאמה מדויקת קודם, ואחר כך הקרוב ביותר
  const pending: string[] = [];
  for (const e of expected) {
    const hit = pool.find((x) => !x.used && x.n === norm(e));
    if (hit) hit.used = true; else pending.push(e);
  }
  for (const e of pending) {
    let best: any = null, bd = 1e9;
    for (const x of pool) if (!x.used) { const dd = lev(x.n, norm(e)); if (dd < bd) { bd = dd; best = x; } }
    if (best && bd <= Math.max(2, Math.ceil(norm(e).length * 0.4))) { best.used = true; problems.push({ type: "wrong", expected: e, seen: best.t }); }
    else problems.push({ type: "missing", expected: e });
  }
  for (const x of pool) {
    if (x.used || !x.n) continue;
    if (expected.some((e) => norm(e) === x.n)) { if (x.n !== norm("נתיב")) problems.push({ type: "duplicate", seen: x.t }); }
    else if (/[א-ת]/.test(x.t) || /[A-Za-z]{2,}/.test(x.t)) problems.push({ type: "extra", seen: x.t });
  }
  return { ok: problems.length === 0, problems, seen, at: new Date().toISOString() };
}

// ---------- תור היצירה ----------
const selfUrl = `${URL_}/functions/v1/masa-ai`;
function kick(action = "work", id?: string) {
  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(fetch(selfUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-masa-internal": SRV, Authorization: `Bearer ${SRV}` },
    body: JSON.stringify({ action, id }),
  }).catch(() => {}));
}
async function setStatus(id: string, patch: Record<string, unknown>) {
  await db.from("masa_participants").update({ ...patch, status_at: new Date().toISOString() }).eq("id", id);
}
async function loadBytes(path: string) {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}
async function saveVersion(p: any, bytes: Uint8Array, kind: string) {
  const path = `${p.workshop_id}/${p.id}/${Date.now()}-${kind}.png`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
  if (error) throw error;
  const versions = [...(p.map_versions ?? []), { path, kind, at: new Date().toISOString() }];
  return { path, versions };
}

async function stageGenerate(p: any) {
  const d = await gen(IMAGE_MODEL, {
    contents: [{ parts: [{ text: mapPrompt(p) }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2", imageSize: IMAGE_SIZE } },
  }, 2);
  const bytes = imageOf(d);
  if (!bytes) throw new Error("no image returned: " + JSON.stringify(d).slice(0, 300));
  const { path, versions } = await saveVersion(p, bytes, "gen");
  // המפה מוכנה מיד. הבדיקה רצה ברקע ורק מסמנת למפעיל.
  await setStatus(p.id, { map_status: "ready", step: "ready", map_path: path, map_versions: versions, fixes: 0, check_result: null });
  kick("check", p.id);
}

async function stageCheck(id: string) {
  const { data: p } = await db.from("masa_participants").select("*").eq("id", id).single();
  if (!p?.map_path) return;
  const path = p.map_path;
  const res: any = await checkMap(await loadBytes(path), p.map_text);
  // אות פה ושם זה בסדר. מסמנים רק תווית חסרה, כפולה או ג'יבריש (רחוק מאוד מהמקור).
  const far = res.problems.filter((x: any) => x.type === "wrong" && lev(norm(x.seen), norm(x.expected)) > Math.max(2, norm(x.expected).length * 0.34));
  const gross = res.problems.filter((x: any) => x.type === "missing" || x.type === "duplicate").concat(far);
  res.flag = gross.length > 0;
  res.gross = gross;
  const { data: now } = await db.from("masa_participants").select("map_path").eq("id", id).single();
  if (now?.map_path === path) await db.from("masa_participants").update({ check_result: res }).eq("id", id);
}

// ---------- תיקון נקודתי ----------
// הדפדפן מוצא את התווית, חותך רצועה ברזולוציה מלאה, מקבל רצועה מתוקנת ומדביק בחזרה.
async function locateLabel(bytes: Uint8Array, label: string, all: string[]) {
  const prompt = `Find the banner/label plate in this poster whose text is meant to say: "${label}" (it may be drawn with a misspelled letter).
Other labels on the poster, for reference: ${all.map((x) => `"${x}"`).join(", ")}.
Return JSON only: {"box_2d":[ymin, xmin, ymax, xmax]} in 0-1000 normalized coordinates, tightly around the text line itself (not the whole banner, not other lines).`;
  const d = await gen(CHECK_MODEL, {
    contents: [{ parts: [await imagePart(bytes), { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0, mediaResolution: "MEDIA_RESOLUTION_HIGH" },
  });
  const r = parseJson(textOf(d));
  const b = r.box_2d ?? r.box ?? r[0]?.box_2d;
  if (!Array.isArray(b) || b.length !== 4) throw new Error("label not found");
  return b.map(Number);
}

async function patchLabel(crop: Uint8Array, label: string, ratio: string) {
  const prompt = `This is a small crop from an illustrated poster. It shows one Hebrew text line, possibly misspelled.
Redraw this exact crop so the Hebrew text reads exactly: "${label}" (letters, right to left: ${[...label].join(" ")}).
Keep the same framing, position, background, banner texture, colors, ink color, typeface style, weight and size. Change only the letters. Output the same picture with corrected text.`;
  const d = await gen(IMAGE_MODEL, {
    contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: b64(crop) } }, { text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ratio, imageSize: "2K" } },
  }, 2);
  const out = imageOf(d);
  if (!out) throw new Error("patch returned no image");
  return out;
}

async function work() {
  const { data: rows, error } = await db.rpc("masa_claim", { p_max: MAX_PARALLEL });
  if (error) throw error;
  const p = rows?.[0];
  if (!p) return { idle: true };
  try {
    await stageGenerate(p);
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await setStatus(p.id, { map_status: p.attempts < 3 ? "queued" : "failed", error: msg });
  }
  kick(); // לעבודה הבאה בתור
  return { id: p.id };
}

async function signed(path: string, download?: string) {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}


// פעולות תיקון משותפות למשתתפת ולמפעיל (p כבר מאומת)
async function fixActions(action: string, p: any, body: any) {
  if (action === "locate") {
    if (!p.map_path) return json({ error: "no map" }, 400);
    const box = await locateLabel(await loadBytes(p.map_path), String(body.label), labelsOf(p.map_text ?? {}));
    return json({ box, url: await signed(p.map_path) });
  }
  if (action === "patch") {
    if ((p.fixes ?? 0) >= 12) return json({ error: "too many fixes" }, 429);
    const bin = atob(String(body.crop ?? ""));
    const crop = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) crop[i] = bin.charCodeAt(i);
    if (crop.length > 6_000_000) return json({ error: "crop too large" }, 400);
    const out = await patchLabel(crop, String(body.label), String(body.ratio ?? "16:9"));
    await db.from("masa_participants").update({ fixes: (p.fixes ?? 0) + 1 }).eq("id", p.id);
    return json({ patch: b64(out) });
  }
  if (action === "upload_url") {
    const path = `${p.workshop_id}/${p.id}/${Date.now()}-patch.png`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return json({ path, url: data.signedUrl });
  }
  if (action === "commit") {
    const path = String(body.path ?? "");
    if (!path.startsWith(`${p.workshop_id}/${p.id}/`)) return json({ error: "bad path" }, 400);
    const versions = [...(p.map_versions ?? []), { path, kind: "patch", label: body.label ?? null, at: new Date().toISOString() }];
    await setStatus(p.id, { map_path: path, map_versions: versions, map_status: "ready", print_status: p.print_status === "printed" ? "printed" : "none" });
    return json({ ok: true, url: await signed(path) });
  }
  if (action === "undo") {
    const vs = [...(p.map_versions ?? [])];
    if (vs.length < 2) return json({ error: "nothing to undo" }, 400);
    vs.pop();
    await setStatus(p.id, { map_path: vs[vs.length - 1].path, map_versions: vs, map_status: "ready" });
    return json({ ok: true, url: await signed(vs[vs.length - 1].path) });
  }
  return null;
}

// ---------- ניתוב ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action;
  try {
    // פנימי
    if (["work", "check"].includes(action)) {
      if (req.headers.get("x-masa-internal") !== SRV) return json({ error: "forbidden" }, 403);
      const job = action === "work" ? work() : stageCheck(body.id);
      // @ts-ignore EdgeRuntime
      EdgeRuntime.waitUntil(job.catch(async (e: Error) => {
        if (body.id) await setStatus(body.id, { map_status: "queued", error: String(e.message).slice(0, 500) });
        kick();
      }));
      return json({ ok: true });
    }
    if (action === "kick") { kick(); return json({ ok: true }); }

    if (action === "models") {
      const { data: m } = await db.from("masa_config").select("v").eq("k", "master").single();
      if (body.master !== m?.v) return json({ error: "forbidden" }, 403);
      const r = await fetch(`${GEMINI}/models?pageSize=200&key=${KEY}`);
      const d = await r.json();
      return json((d.models ?? []).map((x: any) => x.name).filter((n: string) => /gemini|imagen/.test(n)));
    }

    if (action === "debug_check") {
      const { data: m } = await db.from("masa_config").select("v").eq("k", "master").single();
      if (body.master !== m?.v) return json({ error: "forbidden" }, 403);
      const { data: p } = await db.from("masa_participants").select("*").eq("token", body.token).single();
      return json(await checkMap(await loadBytes(p.map_path), p.map_text, body.model ?? CHECK_MODEL));
    }

    // מפעיל
    if (action?.startsWith("admin_")) {
      const { data: w } = await db.from("masa_workshops").select("id").eq("admin_key", body.admin ?? "").maybeSingle();
      if (!w) return json({ error: "forbidden" }, 403);
      const { data: p } = body.id
        ? await db.from("masa_participants").select("*").eq("id", body.id).eq("workshop_id", w.id).maybeSingle()
        : { data: null };
      if (action === "admin_urls") {
        const { data: ps } = await db.from("masa_participants").select("id,name,map_path").eq("workshop_id", w.id).not("map_path", "is", null);
        const out: Record<string, unknown> = {};
        for (const x of ps ?? []) out[x.id] = { view: await signed(x.map_path), download: await signed(x.map_path, `מפת-המסע-${x.name}.png`) };
        kick();
        return json(out);
      }
      if (!p) return json({ error: "not found" }, 404);
      const fx = await fixActions(action.replace("admin_", ""), p, body);
      if (fx) return fx;
      if (action === "admin_regenerate") {
        await setStatus(p.id, { map_status: "queued", attempts: 0, error: null, print_status: "none", approved: false, typo_note: null });
        kick();
        return json({ ok: true });
      }
      if (action === "admin_accept") {
        await setStatus(p.id, { map_status: "ready" });
        return json({ ok: true });
      }
      return json({ error: "unknown" }, 400);
    }

    // משתתפת
    const { data: p } = await db.from("masa_participants").select("*").eq("token", body.token ?? "").maybeSingle();
    if (!p) return json({ error: "not found" }, 404);

    if (action === "chat") {
      const history = Array.isArray(p.chat) ? p.chat : [];
      const msg = String(body.message ?? "").slice(0, 2000);
      const newHist = msg ? [...history, { role: "user", content: msg }] : history;
      const contents = newHist.length
        ? newHist.map((m: any) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }))
        : [{ role: "user", parts: [{ text: "התחל את השיחה: משפט ברכה קצר אחד, ואז השאלה הראשונה." }] }];
      const d = await gen(TEXT_MODEL, {
        systemInstruction: { parts: [{ text: companionPrompt(p.name, p.form) }] },
        contents,
        generationConfig: { temperature: 0.7 },
      });
      let reply = textOf(d) || g(p.form, "בואי נמשיך. ספרי לי עוד.", "בוא נמשיך. ספר לי עוד.");
      const ready = reply.includes("READY_FOR_MAP");
      reply = reply.replace("READY_FOR_MAP", "").trim();
      const chat = [...newHist, { role: "assistant", content: reply }];
      await db.from("masa_participants").update({ chat, updated_at: new Date().toISOString() }).eq("id", p.id);
      return json({ reply, ready, chat });
    }

    if (action === "compose") {
      const d = await gen(TEXT_MODEL, {
        contents: [{ parts: [{ text: composePrompt(p) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
      });
      const r = parseJson(textOf(d));
      if (!r.map_text?.stations?.length) throw new Error("compose failed");
      await db.from("masa_participants").update({ map_text: r.map_text, summary: r.summary, step: "review", updated_at: new Date().toISOString() }).eq("id", p.id);
      return json(r);
    }

    if (action === "generate") {
      if (!p.map_text?.stations?.length) return json({ error: "no map text" }, 400);
      if (["queued", "generating", "checking", "fixing"].includes(p.map_status)) return json({ ok: true, already: true });
      await setStatus(p.id, { map_status: "queued", attempts: 0, error: null, step: "making", print_status: "none", approved: false, typo_note: null });
      kick();
      return json({ ok: true });
    }


    const fx = await fixActions(action, p, body);
    if (fx) return fx;

    if (action === "status") {
      const ahead = p.map_status === "queued"
        ? (await db.from("masa_participants").select("id", { count: "exact", head: true }).eq("map_status", "queued").lt("status_at", p.status_at)).count ?? 0
        : 0;
      if (p.map_status === "queued") kick();
      return json({ map_status: p.map_status, ahead, error: p.error });
    }

    if (action === "map_url") {
      if (!p.map_path || p.map_status !== "ready") return json({ url: null });
      return json({ url: await signed(p.map_path), download: await signed(p.map_path, `מפת-המסע-${p.name}.png`) });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 500) }, 500);
  }
});
