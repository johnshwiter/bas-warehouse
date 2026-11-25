// BAS Warehouse · Help assistant (Cloudflare Pages Function, served at /api/ask)
// The AI only ever sees the question and this guide. It never sees the database:
// it answers with steps, or with a small instruction that the browser runs with the person's own login.
//
// Cloudflare Pages → Settings → Variables and Secrets:
//   GROQ_API_KEY   (secret)  the free key from console.groq.com
//   GROQ_MODELS    (optional) comma list, tried in order. Default below.
//   CF_MODEL       (optional) Workers AI model used when Groq is out for the day
// Cloudflare Pages → Settings → Bindings: Workers AI, variable name AI (free backup, optional)

const SUPABASE_URL = "https://ksbucedkfdkplobzpxnl.supabase.co";
const SUPABASE_KEY = "sb_publishable_epBi3zw2UHCBTNcrUJeXzg_SCVvw3-F"; // publishable key: public by design
const DEFAULT_GROQ = "openai/gpt-oss-120b,openai/gpt-oss-20b";
const DEFAULT_CF = "@cf/meta/llama-3.1-8b-instruct";

const GUIDE = `You are the help assistant of "BAS Warehouse", the website of the scout group of St. Michael Church, Alexandria.
Users are scout leaders (kada) and the warehouse team. Answer in the language and style of the question (Egyptian Arabic, Franco-Arabic written in Latin letters, English or French). Franco question → answer in Egyptian Arabic unless they ask otherwise. Be short and friendly.

PAGES (link: what is there)
- book.html: Book items. Tap + on items (★ = most used), cart bar at the bottom → Review → date, time, place, notes, tick "We are responsible" → Send request. "Save draft" keeps it for later. For a trip or camp choose Trip/Camp in "What is it for?". Items not available: "Tell me when it's back" (waitlist).
- section.html (leaders) tabs: #dash Dashboard, #requests Requests (edit / ask to change / cancel a request), #history History & search, #equipment Equipment out / back, #money Missing & compensation, #chat Messages with the warehouse team, #news Announcements, #wait Waitlist.
- camp.html: a camp or trip request. Phase 2: "Write who is going" (kada and scouts), "Distribute automatically" for tents, Save who is going.
- ohda.html: Camps & 3ohda (what each person carries).
- attendance.html tabs: #take Take attendance (pick the meeting at the top, tap ✓ / Late / ½ / Absent / Excused for each person, tick 👕 uniform and 🧣 foulard, then ✅ Finish, or 💾 Save draft. A finished meeting is locked: press ✏️ Edit, change, then 💾 Save changes. "+ Meeting without items" adds a meeting). #sum Summary (Attended % and Final %). #people People & tali3as (tap a tali3a to add/remove scouts and set the 3arif and mosa3ed; tap a name → Details: photo, birthday, school year, phones, parents, owns foulard, joining date, notes). #subs Subscription (Paid / Part…). #set Settings (values of each mark, alert %, 3arif period in weeks/months/meetings, "Once a year" move up to another stage).
- calendar.html (team only): events; meetings show here.
- profile.html: name, language, meeting reminder minutes, notifications, ask to move to another stage.
- history.html: past requests.
- records.html: Group records. Every scout's details (parents, jobs, school, address, phones) in a table with search, sorted by stage. Tap a name to see everything and the history of changes. Only people chosen by the warehouse team can change details; removing a scout archives them (Archived list), and only the warehouse team can delete forever (with a code).
- news.html: announcements to everyone or one stage (القادة العامة).
- Bell 🔔 at the top: notifications. Menu ☰: every page. Dark mode and Logout are at the bottom of the menu.
- Team only (team.html): #overview, #requests (Prepare → Ready → Issue → Return), #stock (items, counts, add item), #maint Maintenance, #wait Waitlist, #money Compensation, #chat Messages, #news Announcements, #people Accounts (approve new leaders), #trash Deleted (restore, Delete forever, Empty Deleted), #log Activity, #settings Settings (minimum days, New scout year, Reset). mizania.html = warehouse money, mizania.html?fund=group = Group money (subscriptions).
RULES: leaders see only their own stage. Kada = leaders, scouts = the kids. Every tali3a has a 3arif and a mosa3ed 3arif.

REPLY with ONE JSON object, nothing else:
{"reply": "short answer text", "steps": ["step 1", "step 2"], "link": "page.html#tab or null", "lookup": null, "fill": null}
- How-to questions: reply + steps + link.
- When they want information about people or items, set "lookup" (the website finds it; you never know the data, so never invent names, numbers or dates):
  {"type":"person","name":"<name as written>","name_ar":"<same name in Arabic letters>","want":["phone","father_name","father_phone","mother_name","mother_phone","birthday","school_year","tali3a","attendance","subscription","notes","joined","foulard"]}  (only the fields asked; "all" for everything)
  {"type":"list","what":"unpaid|birthdays|low_attendance|no_tali3a|arif|no_foulard","period":"today|week|month","stage":"<stage name or null>"}
  {"type":"stock","items":[{"ar":"<Arabic name>","en":"<English name>"}]}
  {"type":"my_requests"}
- When they want something DONE, set "fill": the website opens the page already filled in and THEY press the last button. You cannot save anything yourself, so say "check it and press …".
  {"type":"book","items":[{"ar":"<Arabic item name>","en":"<English item name>","qty":10,"color":""}],"date":"YYYY-MM-DD","time":"HH:MM","until":"HH:MM","place":"","notes":"","kind":"Meeting|Trip|Camp","end":"YYYY-MM-DD","for":"<stage or service, team only>"}
  {"type":"sub_paid","name":"<person>","name_ar":"<in Arabic letters>","amount":null}
  {"type":"tali3a","name":"<tali3a>"}   {"type":"person","name":"<person>","name_ar":"<in Arabic letters>"}   {"type":"attendance","date":"YYYY-MM-DD"}
- Item names: give both Arabic and English (shoma = شومة = stick, 5eema = خيمة = tent).
- Dates: work them out from TODAY below; leave empty when not said. Use only the fields you know.
- Anything unrelated to the website: say politely you only help with the website.`;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function parseJSON(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) {}
  const m = String(t).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

async function askGroq(env, model, messages) {
  const body = { model, messages, temperature: 0.2, max_completion_tokens: 1200, response_format: { type: "json_object" } };
  if (/gpt-oss/.test(model)) body.reasoning_effort = "low";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.GROQ_API_KEY }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("groq " + r.status);
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
}

async function askCF(env, messages) {
  const d = await env.AI.run(env.CF_MODEL || DEFAULT_CF, { messages, max_tokens: 900, temperature: 0.2 });
  return typeof d === "string" ? d : d && (d.response || (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content));
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in first." }, 401);
  let inp;
  try { inp = await request.json(); } catch (e) { return json({ error: "Bad request." }, 400); }
  const q = String(inp.q || "").trim().slice(0, 600);
  if (!q) return json({ error: "Write a question." }, 400);

  // counts one question with the person's own login (and checks they're signed in and approved)
  const u = await fetch(SUPABASE_URL + "/rest/v1/rpc/ai_use", {
    method: "POST", headers: { apikey: SUPABASE_KEY, authorization: auth, "content-type": "application/json" }, body: "{}"
  });
  if (!u.ok) return json({ error: "Sign in first." }, 401);
  const use = await u.json();
  if (!use.ok) return json({ error: "limit", left: 0, limit: use.limit }, 429);

  const ctx = "TODAY: " + String(inp.today || "").slice(0, 40) + ". The user is " + (use.admin ? "on the warehouse team (sees every stage)" : "a stage leader") + ". Website language: " + String(inp.lang || "en").slice(0, 2) + ".";
  const hist = Array.isArray(inp.history) ? inp.history.slice(-4) : [];
  const messages = [{ role: "system", content: GUIDE + "\n\n" + ctx }];
  hist.forEach(h => {
    if (h && h.q) messages.push({ role: "user", content: String(h.q).slice(0, 600) });
    if (h && h.a) messages.push({ role: "assistant", content: String(h.a).slice(0, 1500) });
  });
  messages.push({ role: "user", content: q });

  const models = String(env.GROQ_MODELS || DEFAULT_GROQ).split(",").map(s => s.trim()).filter(Boolean);
  let out = null, used = "";
  if (env.GROQ_API_KEY) {
    for (const m of models) {
      try { out = parseJSON(await askGroq(env, m, messages)); if (out) { used = m; break; } } catch (e) { /* busy or out for today: try the next */ }
    }
  }
  if (!out && env.AI) {
    try { out = parseJSON(await askCF(env, messages)); if (out) used = "cf"; } catch (e) {}
  }
  if (!out) {
    await fetch(SUPABASE_URL + "/rest/v1/rpc/ai_refund", { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: auth, "content-type": "application/json" }, body: "{}" }).catch(() => {});
    return json({ error: "busy", left: use.left + 1 }, 503);
  }
  return json({ answer: out, left: use.left, limit: use.limit, model: used });
}

export async function onRequest({ request }) {
  if (request.method === "POST") return json({ error: "Bad request." }, 400);
  return json({ ok: true });
}
