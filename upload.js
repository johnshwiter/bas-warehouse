// BAS Warehouse · meeting plan files → Google Drive (Cloudflare Pages Function, served at /api/upload)
// The file goes to the Google script in bas.warehouse193@gmail.com, which saves it in
// "BAS Backups (don't move or rename)/Meeting plans/<stage>/<date>" and gives back a view link.
//
// Cloudflare Pages → Settings → Variables and Secrets:
//   DRIVE_URL    the Web app URL of the Google script (same one as the backup)
//   DRIVE_TOKEN  (secret) the same BACKUP_TOKEN as in the script

const SUPABASE_URL = "https://ksbucedkfdkplobzpxnl.supabase.co";
const SUPABASE_KEY = "sb_publishable_epBi3zw2UHCBTNcrUJeXzg_SCVvw3-F"; // publishable key: public by design
const MAX_BYTES = 20 * 1024 * 1024;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in first." }, 401);
  if (!env.DRIVE_URL || !env.DRIVE_TOKEN) return json({ error: "File uploads aren't set up yet." }, 503);
  let p;
  try { p = await request.json(); } catch (e) { return json({ error: "Bad request." }, 400); }
  const sec = Number(p.section_id);
  if (!sec) return json({ error: "Bad request." }, 400);

  // only this stage's kada (or the warehouse team) can add files; answers the stage's name
  const ok = await fetch(SUPABASE_URL + "/rest/v1/rpc/plan_upload_ok", {
    method: "POST", headers: { apikey: SUPABASE_KEY, authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ p_section: sec })
  });
  if (!ok.ok) { let m = "You can only add files for your own stage."; try { m = (await ok.json()).message || m; } catch (e) {} return json({ error: m }, 403); }
  const stage = await ok.json();

  let body;
  if (p.action === "trash") {
    if (!/^[\w-]{10,}$/.test(String(p.id || ""))) return json({ error: "Bad request." }, 400);
    body = { token: env.DRIVE_TOKEN, kind: "trash_file", id: String(p.id) };
  } else {
    const b64 = String(p.b64 || ""), mime = String(p.mime || "application/octet-stream");
    if (!b64) return json({ error: "No file." }, 400);
    if (/^video\//.test(mime)) return json({ error: "Videos can't be uploaded. Put them in Drive and paste the link." }, 400);
    if (b64.length * 0.75 > MAX_BYTES) return json({ error: "The file is bigger than 20 MB." }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || "")) ? p.date : "No date";
    body = { token: env.DRIVE_TOKEN, kind: "file", stage, date, name: String(p.name || "file").slice(0, 120), mime, b64 };
  }
  let r, out;
  try {
    r = await fetch(env.DRIVE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "follow" });
    out = await r.json();
  } catch (e) {
    return json({ error: "Google Drive didn't answer. Try again." }, 502);
  }
  if (!out || !out.ok) return json({ error: (out && out.error) || "Google Drive refused the file." }, 502);
  return json(out);
}

export async function onRequest({ request }) {
  if (request.method === "POST") return json({ error: "Bad request." }, 400);
  return json({ ok: true, uploads: true });
}
