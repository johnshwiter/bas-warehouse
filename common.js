// =========================================================
// BAS WAREHOUSE SYSTEM: shared code for every page
// =========================================================
"use strict";

const BAS = {
  user: null,       // Supabase auth user
  profile: null,    // row from public.profiles
  sections: [],
  services: [],
  settings: { min_days: 2, low_pct: 20, return_days: 7, times: ["1:30 PM", "1:45 PM", "2:00 PM", "2:30 PM"] },
  lang: (function () { try { return localStorage.getItem("basLang") || "en"; } catch (e) { return "en"; } })(),

  CAT_ICONS: { Kashfy: "🪵", Crafts: "🎨", Games: "⚽", Kitchen: "🍳", Flags: "🚩", Camping: "⛺", Uniform: "👕", Tools: "🔧", Other: "📦" },
  icon(cat) { return this.CAT_ICONS[cat] || "📦"; },

  // ---------- language (menus and the login page now; every screen in the next phase) ----------
  WORDS: {
    "My stage": { ar: "مرحلتي", fr: "Mon unité" },
    "Overview": { ar: "نظرة عامة", fr: "Vue d'ensemble" },
    "Requests": { ar: "الطلبات", fr: "Demandes" },
    "Book items": { ar: "حجز أدوات", fr: "Réserver" },
    "Calendar": { ar: "التقويم", fr: "Calendrier" },
    "Stock": { ar: "المخزون", fr: "Stock" },
    "Profile": { ar: "حسابي", fr: "Profil" },
    "Logout": { ar: "خروج", fr: "Déconnexion" },
    "Warehouse team": { ar: "فريق المخزن", fr: "Équipe entrepôt" },
    "Leader": { ar: "قائد", fr: "Chef" }
  },
  t(s) { const w = this.WORDS[s]; return (w && w[this.lang]) || s; },
  setLang(l) {
    this.lang = l; try { localStorage.setItem("basLang", l); } catch (e) {}
    if (this.user && typeof supabaseClient !== "undefined") supabaseClient.rpc("set_my_lang", { p_lang: l }).then(() => {});
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  },

  isAdmin() { return !!(this.profile && this.profile.role === "admin" && this.profile.approval_status === "approved"); },
  isApproved() { return !!(this.profile && this.profile.approval_status === "approved"); },

  sectionName(id, lang) {
    const s = this.sections.find(x => x.id === id);
    if (!s) return "—";
    return lang === "en" ? s.name_en : s.name_ar;
  },
  serviceName(id) {
    const s = this.services.find(x => x.id === id);
    return s ? s.name_ar : "Church service";
  },
  // a stage or a church service, safe for HTML, kept in its own direction
  secHTML(id) { return '<bdi dir="auto">' + this.esc(this.sectionName(id)) + "</bdi>"; },
  borrowerName(secId, svcId) { return svcId ? this.serviceName(svcId) : this.sectionName(secId); },
  borrowerHTML(r) {
    if (r.service_id) return '<bdi dir="auto">' + this.esc(this.serviceName(r.service_id)) + '</bdi> <span class="pill svc">SERVICE</span>';
    return this.secHTML(r.section_id);
  },
  // link to the page of a stage or service
  borrowerURL(secId, svcId) { return "section.html?" + (svcId ? "service=" + svcId : "id=" + secId); },

  // where each person lands after logging in
  homeURL() {
    if (!this.user) return "auth.html";
    if (!this.isApproved()) return "auth.html?pending=1";
    if (this.isAdmin()) return "team.html";
    return "section.html";
  },

  async init(active) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    this.user = session ? session.user : null;
    const sec = await supabaseClient.from("sections").select("id, name_en, name_ar").order("id");
    if (!sec.error) this.sections = sec.data || [];
    if (this.user) {
      const p = await supabaseClient.from("profiles").select("id, full_name, role, approval_status, section_id, lang").eq("id", this.user.id).single();
      this.profile = p.error ? null : p.data;
      if (this.isApproved()) {
        const st = await supabaseClient.from("settings").select("*").eq("id", 1).single();
        if (!st.error && st.data) this.settings = st.data;
        const sv = await supabaseClient.from("services").select("id, name_ar, name_en, is_active").order("id");
        if (!sv.error) this.services = sv.data || [];
      }
    }
    this.header(active);
    if (this.isApproved()) {
      supabaseClient.rpc("check_alerts").then(() => this.loadBell());
      if (this.profile.lang !== this.lang) supabaseClient.rpc("set_my_lang", { p_lang: this.lang }).then(() => {});
      clearInterval(this._bt); this._bt = setInterval(() => this.loadBell(), 60000);
    }
    this.registerSW();
    return this;
  },

  // ---------- top bar ----------
  header(active) {
    let h = document.getElementById("top");
    if (!h) { h = document.createElement("header"); h.id = "top"; document.body.prepend(h); }
    const L = [];
    if (this.isAdmin()) {
      L.push(["overview", "team.html", "Overview"], ["requests", "team.html#requests", "Requests"], ["book", "book.html", "Book items"],
        ["calendar", "calendar.html", "Calendar"], ["stock", "team.html#stock", "Stock"], ["profile", "profile.html", "Profile"]);
    } else if (this.isApproved()) {
      L.push(["stage", "section.html", "My stage"], ["book", "book.html", "Book items"], ["calendar", "calendar.html", "Calendar"], ["profile", "profile.html", "Profile"]);
    }
    const name = this.profile ? this.profile.full_name : (this.user ? this.user.email : "");
    const tag = this.isAdmin() ? this.t("Warehouse team") : (this.profile && this.profile.section_id ? this.sectionName(this.profile.section_id) : "");
    h.className = "topbar";
    h.innerHTML = '<div class="topbar-in">' +
      '<a class="brand" href="' + this.homeURL() + '"><img src="logo.png" alt="BA Scout"><div><b>BI ARCHI ANGELOUS</b><span>BAS Warehouse</span></div></a>' +
      '<nav class="nav">' + L.map(x => '<a href="' + x[1] + '"' + (x[0] === active ? ' class="on"' : "") + ' data-nav="' + x[0] + '">' + this.esc(this.t(x[2])) + "</a>").join("") + "</nav>" +
      (this.user ? '<div class="me">' + (this.isApproved() ? '<button class="bell" id="bellBtn" aria-label="Notifications">🔔<span class="bdg" id="bellN" hidden></span></button>' : "") + '<div class="who"><strong>' + this.esc(name) + "</strong><small>" + this.esc(tag) + '</small></div><button class="navbtn" id="logoutBtn">' + this.esc(this.t("Logout")) + "</button></div>" : "") +
      "</div>";
    const lo = document.getElementById("logoutBtn");
    if (lo) lo.onclick = async () => { await supabaseClient.auth.signOut(); location.href = "auth.html"; };
    const bb = document.getElementById("bellBtn");
    if (bb) bb.onclick = e => { e.stopPropagation(); this.toggleBell(); };
  },

  requireApproved() {
    if (!this.user) { location.href = "auth.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search); return false; }
    if (!this.isApproved()) { location.href = "auth.html?pending=1"; return false; }
    return true;
  },
  requireAdmin() {
    if (!this.requireApproved()) return false;
    if (!this.isAdmin()) { location.href = this.homeURL(); return false; }
    return true;
  },

  toast(msg, kind) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.className = "toast " + (kind || ""); }, 3500);
  },
  errText(e) {
    if (!e) return "Something went wrong.";
    return (e.message || String(e)).replace(/^.*?ERROR:\s*/, "");
  },

  // ---------- dates ----------
  d(s) { return typeof s === "string" && s.length === 10 ? new Date(s + "T00:00:00") : new Date(s); },
  loc() { return { ar: "ar-EG-u-nu-latn", fr: "fr-FR" }[this.lang] || "en-GB"; },
  fmtDate(d, withDay) {
    if (!d) return "";
    return this.d(d).toLocaleDateString(this.loc(), withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  },
  fmtDateTime(d) {
    if (!d) return "";
    return new Date(d).toLocaleString(this.loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  },
  todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
  isoOf(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); },
  daysFromToday(iso) { return Math.round((this.d(iso) - this.d(this.todayISO())) / 86400000); },
  isLate(r) {
    if (!r.meeting_date || !r.created_at) return false;
    const made = new Date(r.created_at); made.setHours(0, 0, 0, 0);
    return (this.d(r.meeting_date) - made) / 86400000 < (this.settings.min_days || 0);
  },
  isOverdue(r) { return (r.status === "Issued" || r.status === "Partially Returned") && r.return_by && r.return_by < this.todayISO(); },

  // ---------- statuses ----------
  OPEN: ["Pending", "Preparing", "Ready", "Issued", "Partially Returned"],
  PRE: ["Pending", "Preparing", "Ready"],
  OUT: ["Issued", "Partially Returned"],
  STATUS_LABEL: {
    Pending: "Waiting", Preparing: "Preparing", Ready: "Ready to collect", Issued: "Issued",
    "Partially Returned": "Partly returned", Returned: "Returned", Completed: "Completed", Cancelled: "Cancelled", Rejected: "Rejected"
  },
  statusSlug(s) { return String(s || "").toLowerCase().replace(/\s+/g, "-"); },
  statusBadge(s) { return '<span class="status status-' + this.statusSlug(s) + '">' + this.esc(this.STATUS_LABEL[s] || s) + "</span>"; },

  lineName(l) { return l.name + (l.variant ? " (" + l.variant + ")" : ""); },
  itemLabel(stockBy, itemId, varId) {
    const it = stockBy[itemId]; if (!it) return "Item #" + itemId;
    const v = varId ? (it.variants || []).find(x => x.id === varId) : null;
    return it.name_en + (v ? " (" + v.name + ")" : "");
  },
  // "2:30 PM" in the reader's language
  time(t) { if (!t) return ""; return this.lang === "ar" ? String(t).replace(/\bPM\b/i, "م").replace(/\bAM\b/i, "ص") : t; },
  money(n) { return Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 }) + (this.lang === "ar" ? " ج.م" : " EGP"); },

  async q(p) { const r = await p; if (r.error) throw r.error; return r.data; },

  // ---------- loaders ----------
  async loadStock() {
    const s = await supabaseClient.rpc("item_stock");
    if (s.error) throw s.error;
    const byId = {};
    s.data.forEach(i => { byId[i.id] = i; });
    return { list: s.data, byId };
  },

  // reservations the user may see (RLS decides), with their lines and any pending change
  async loadReservations(stockBy, filter) {
    let qr = supabaseClient.from("reservations")
      .select("id, section_id, service_id, requested_by, status, notes, meeting_date, meeting_time, place, created_at, prepared_at, ready_at, issued_at, received_by_name, return_by, returned_at, completed_at, closed_reason")
      .order("meeting_date", { ascending: false }).limit(1000);
    if (filter && filter.section_id) qr = qr.eq("section_id", filter.section_id);
    if (filter && filter.service_id) qr = qr.eq("service_id", filter.service_id);
    const res = await this.q(qr);
    const ids = res.map(x => x.id);
    let lines = [], changes = [];
    for (let i = 0; i < ids.length; i += 150) {
      const part = ids.slice(i, i + 150);
      lines = lines.concat(await this.q(supabaseClient.from("reservation_items")
        .select("id, reservation_id, item_id, variant_id, quantity, prepared_qty, prep_note, issued_qty, returned_qty, missing_qty, damaged_qty").in("reservation_id", part)));
      changes = changes.concat(await this.q(supabaseClient.from("reservation_changes").select("*").in("reservation_id", part).eq("status", "Pending")));
    }
    let names = {};
    if (this.isAdmin()) {
      const pr = await supabaseClient.from("profiles").select("id, full_name");
      if (!pr.error) pr.data.forEach(p => { names[p.id] = p.full_name; });
    } else if (this.profile) names[this.profile.id] = this.profile.full_name;
    this.NAMES = names;
    return res.map(r => Object.assign(r, {
      requester: names[r.requested_by] || "",
      change: changes.find(c => c.reservation_id === r.id) || null,
      items: lines.filter(l => l.reservation_id === r.id).map(l => {
        const it = stockBy && stockBy[l.item_id];
        const v = it && l.variant_id ? (it.variants || []).find(x => x.id === l.variant_id) : null;
        return Object.assign(l, {
          name: it ? it.name_en : "Item #" + l.item_id,
          variant: v ? v.name : (l.variant_id ? "colour #" + l.variant_id : ""),
          kind: it ? it.kind : "Returnable",
          out: Math.max(0, (l.issued_qty || 0) - l.returned_qty - l.missing_qty - l.damaged_qty)
        });
      })
    }));
  },

  // text that describes a change request ("Shoum 2 → 4, date 27 Nov → 28 Nov")
  changeSummary(r, c, stockBy) {
    const parts = [];
    if (c.meeting_date !== r.meeting_date) parts.push("date " + this.fmtDate(r.meeting_date, true) + " → <b>" + this.esc(this.fmtDate(c.meeting_date, true)) + "</b>");
    if ((c.meeting_time || "") !== (r.meeting_time || "")) parts.push("time → <b>" + this.esc(c.meeting_time || "—") + "</b>");
    if ((c.place || "") !== (r.place || "")) parts.push("place → <b>" + this.esc(c.place) + "</b>");
    const now = {}, want = {};
    r.items.forEach(l => { now[l.item_id + ":" + (l.variant_id || "")] = l.quantity; });
    (c.items || []).forEach(x => { const k = x.item_id + ":" + (x.variant_id || ""); want[k] = (want[k] || 0) + Number(x.qty); });
    Object.keys(Object.assign({}, now, want)).forEach(k => {
      const a = now[k] || 0, b = want[k] || 0;
      if (a === b) return;
      const p = k.split(":");
      parts.push(this.esc(this.itemLabel(stockBy, Number(p[0]), p[1] ? Number(p[1]) : null)) + " " + a + " → <b>" + b + "</b>");
    });
    return parts.length ? parts.join(" · ") : "no differences";
  },

  // read-only card for a request (used on stage pages)
  reqCard(r, opts) {
    opts = opts || {};
    const issued = ["Issued", "Partially Returned", "Returned", "Completed"].indexOf(r.status) >= 0;
    const pre = this.PRE.indexOf(r.status) >= 0;
    const h = '<div class="req ' + this.statusSlug(r.status) + '" id="req' + r.id + '">' +
      '<div class="req-top"><h3>' + (opts.showBorrower ? this.borrowerHTML(r) + " · " : "") + "#" + r.id + " · " + this.esc(this.fmtDate(r.meeting_date, true)) +
      "<small><bdi>" + this.esc(this.time(r.meeting_time)) + "</bdi> · <bdi>" + this.esc(r.place || "") + "</bdi></small></h3>" +
      "<div>" + (this.isOverdue(r) ? '<span class="pill late">OVERDUE</span> ' : "") + (pre && this.isLate(r) ? '<span class="pill late">LATE</span> ' : "") + this.statusBadge(r.status) + "</div></div>" +
      '<div class="meta">Sent ' + this.esc(this.fmtDateTime(r.created_at)) + (r.requester ? " by " + this.esc(r.requester) : "") +
      (r.issued_at ? " · issued " + this.esc(this.fmtDateTime(r.issued_at)) + (r.received_by_name ? " to " + this.esc(r.received_by_name) : "") : "") +
      (r.return_by && this.OUT.indexOf(r.status) >= 0 ? " · return by <b>" + this.esc(this.fmtDate(r.return_by)) + "</b>" : "") +
      (r.returned_at ? " · back " + this.esc(this.fmtDateTime(r.returned_at)) : "") + "</div>" +
      '<div class="tscroll"><table class="ltable"><tr><th>Item</th><th class="num">Asked</th>' + (issued ? '<th class="num">Issued</th><th class="num">Back</th><th class="num">Missing</th><th class="num">Damaged</th><th class="num">Still out</th>' : "") + "</tr>" +
      r.items.map(i => '<tr><td><a class="lnk" href="item.html?id=' + i.item_id + '">' + this.esc(this.lineName(i)) + "</a>" + (i.kind === "Consumable" ? ' <small class="mut">(used up)</small>' : "") + '</td><td class="num">' + i.quantity + "</td>" +
        (issued ? '<td class="num">' + (i.issued_qty == null ? "—" : i.issued_qty) + '</td><td class="num">' + i.returned_qty + '</td><td class="num' + (i.missing_qty ? ' bad"><b>' + i.missing_qty + "</b>" : '">0') + '</td><td class="num' + (i.damaged_qty ? ' bad"><b>' + i.damaged_qty + "</b>" : '">0') +
          '</td><td class="num">' + (i.kind === "Consumable" && r.status !== "Issued" ? "used" : i.out) + "</td>" : "") + "</tr>").join("") + "</table></div>" +
      (r.notes ? '<div class="msg warn" data-noi18n dir="auto">' + this.esc(r.notes) + "</div>" : "") +
      (r.closed_reason ? '<div class="meta">Reason: ' + this.esc(r.closed_reason) + "</div>" : "") +
      (r.change ? '<div class="change-box">✏️ Change waiting for the warehouse team: ' + this.changeSummary(r, r.change, opts.stockBy || {}) + (r.change.reason ? " · <i>" + this.esc(r.change.reason) + "</i>" : "") + (opts.extraChange || "") + "</div>" : "") +
      (opts.actions ? '<div class="actions">' + opts.actions + "</div>" : "") +
      (opts.msgs ? this.commentsHTML(r.id, opts.msgs) : "") +
      "</div>";
    return h;
  },

  // missing/damaged lines with what is paid; works for one stage, one service, or everyone
  lossTable(losses, stockBy, opts) {
    opts = opts || {};
    if (!losses.length) return '<div class="empty">Nothing missing or damaged. 👌</div>';
    return '<div class="panel tscroll"><table class="ltable"><tr><th>Date</th>' + (opts.who ? "<th>Stage / service</th>" : "") + '<th>Item</th><th>Kind</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th class="num">Paid</th><th>Status</th><th>Request</th>' + (opts.admin ? "<th></th>" : "") + "</tr>" +
      losses.map(l => "<tr><td class=\"nowrap\">" + this.esc(this.fmtDate(l.occurred_on)) + "</td>" +
        (opts.who ? '<td><a class="lnk" href="' + this.borrowerURL(l.section_id, l.service_id) + '"><bdi>' + this.esc(this.borrowerName(l.section_id, l.service_id)) + "</bdi></a></td>" : "") +
        '<td><a class="lnk" href="item.html?id=' + l.item_id + '">' + this.esc(this.itemLabel(stockBy, l.item_id, l.variant_id)) + "</a>" + (l.note ? '<br><small class="mut">' + this.esc(l.note) + "</small>" : "") + "</td>" +
        "<td>" + (l.kind === "missing" ? '<span class="pill bad">MISSING</span>' : '<span class="pill warn">DAMAGED</span>') + '</td><td class="num">' + l.qty + "</td>" +
        '<td class="num">' + (opts.admin ? '<input type="number" min="0" value="' + Number(l.unit_price) + '" data-lp="' + l.id + '">' : Number(l.unit_price)) + '</td><td class="num"><b>' + Number(l.amount) + '</b></td><td class="num">' + Number(l.paid) + "</td>" +
        "<td>" + (Number(l.amount) <= 0 ? '<span class="pill mut">NO PRICE</span>' : l.settled ? '<span class="pill ok">PAID</span>' : '<span class="pill late">' + Number(l.remaining) + " LEFT</span>") + "</td>" +
        "<td>" + (l.reservation_id ? "#" + l.reservation_id : "—") + "</td>" +
        (opts.admin ? '<td class="nowrap"><button class="btn line sm" data-lsave="' + l.id + '">Save price</button> ' + (!l.settled && Number(l.amount) > 0 ? '<button class="btn ok sm" data-lpaid="' + l.id + '">Paid ✓</button>' : "") + "</td>" : "") +
        "</tr>").join("") + "</table></div>";
  },

  // things to show on a calendar: pickups, return dates, events
  calItems(res, events, withBorrower) {
    const out = [];
    const who = r => withBorrower ? " \u2068" + this.borrowerName(r.section_id, r.service_id) + "\u2069" : "";
    res.forEach(r => {
      if (r.status === "Cancelled" || r.status === "Rejected") return;
      out.push({ date: r.meeting_date, cls: "pick", ref: { res: r.id }, text: "📦 #" + r.id + who(r),
        title: "Pickup #" + r.id + " · " + this.borrowerName(r.section_id, r.service_id) + " · " + (r.meeting_time || "") + " · " + r.items.map(i => this.lineName(i) + " ×" + i.quantity).join(", ") });
      if (this.OUT.indexOf(r.status) >= 0 && r.return_by)
        out.push({ date: r.return_by, cls: this.isOverdue(r) ? "late" : "ret", ref: { res: r.id }, text: "↩ #" + r.id + who(r), title: "Return due #" + r.id });
    });
    (events || []).forEach(e => {
      const cls = { Meeting: "meet", Trip: "trip", Camp: "camp" }[e.kind] || "meet";
      const end = e.end_date || e.start_date;
      for (let d = this.d(e.start_date); this.isoOf(d) <= end; d.setDate(d.getDate() + 1))
        out.push({ date: this.isoOf(d), cls, ref: { ev: e.id }, text: ({ Meeting: "👥 ", Trip: "🚌 ", Camp: "⛺ " }[e.kind] || "📌 ") + e.title, title: e.kind + ": " + e.title + (e.place ? " · " + e.place : "") });
    });
    return out;
  },

  // month calendar; items: [{date:'YYYY-MM-DD', cls, text, title}]
  calendarHTML(year, month, items, selected, conflicts) {
    const first = new Date(year, month, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 1) % 7)); // weeks start on Saturday
    const today = this.todayISO();
    let h = '<div class="cal">' + ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => '<div class="dow">' + d + "</div>").join("");
    for (let k = 0; k < 42; k++) {
      const d = new Date(start); d.setDate(start.getDate() + k);
      const iso = this.isoOf(d);
      if (k === 35 && d.getMonth() !== month) break;
      const list = items.filter(x => x.date === iso);
      const cf = conflicts && conflicts[iso];
      h += '<div class="day' + (d.getMonth() !== month ? " other" : "") + (iso === today ? " today" : "") + (iso === selected ? " sel" : "") + '" data-day="' + iso + '">' +
        '<div class="dn"><span>' + d.getDate() + "</span>" + (cf ? '<span class="cf" title="Clash">!</span>' : "") + "</div>" +
        list.slice(0, 3).map(x => '<div class="ev ' + x.cls + '" title="' + this.esc(x.title || x.text) + '">' + this.esc(x.text) + "</div>").join("") +
        (list.length > 3 ? '<div class="ev more">+' + (list.length - 3) + " more</div>" : "") + "</div>";
    }
    return h + "</div>";
  },
  // =================== notifications (the bell) ===================
  NOTES: [],
  async loadBell() {
    if (!this.user) return;
    const r = await supabaseClient.from("notifications").select("*").eq("profile_id", this.user.id).order("created_at", { ascending: false }).limit(40);
    if (r.error) return;
    this.NOTES = r.data;
    const n = r.data.filter(x => !x.read_at).length, b = document.getElementById("bellN");
    if (b) { b.hidden = !n; b.textContent = n > 9 ? "9+" : n; }
    if (document.getElementById("bellPanel")) this.drawBell();
  },
  toggleBell() {
    let p = document.getElementById("bellPanel");
    if (p) { p.remove(); return; }
    p = document.createElement("div"); p.id = "bellPanel"; p.className = "bellpanel";
    document.body.appendChild(p);
    p.onclick = e => e.stopPropagation();
    document.addEventListener("click", function off() { const x = document.getElementById("bellPanel"); if (x) x.remove(); document.removeEventListener("click", off); });
    this.drawBell();
  },
  ago(t) {
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    if (m < 1) return "now";
    if (m < 60) return m + " min";
    if (m < 1440) return Math.round(m / 60) + " h";
    return this.fmtDate(t);
  },
  drawBell() {
    const p = document.getElementById("bellPanel"); if (!p) return;
    const unread = this.NOTES.filter(x => !x.read_at).length;
    p.innerHTML = '<div class="bp-head"><b>Notifications</b>' + (unread ? '<button class="linkbtn" id="bpAll">Mark all read</button>' : "") + "</div>" +
      '<div id="bpPush"></div>' +
      '<div class="bp-list">' + (this.NOTES.length ? this.NOTES.map(x => '<a class="bp-row' + (x.read_at ? "" : " new") + '" href="' + this.esc(x.link || "#") + '" data-nid="' + x.id + '">' +
        '<div><b dir="auto">' + this.esc(x.title) + "</b>" + (x.body ? '<span dir="auto">' + this.esc(x.body) + "</span>" : "") + "</div><small>" + this.esc(this.ago(x.created_at)) + "</small></a>").join("")
        : '<div class="empty" style="border:0">Nothing yet.</div>') + "</div>";
    const all = document.getElementById("bpAll");
    if (all) all.onclick = async () => { await supabaseClient.rpc("mark_notifications_read", { p_ids: null }); this.loadBell(); };
    p.querySelectorAll("[data-nid]").forEach(a => a.onclick = async e => {
      e.preventDefault();
      await supabaseClient.rpc("mark_notifications_read", { p_ids: [Number(a.dataset.nid)] });
      const href = a.getAttribute("href");
      const here = location.pathname.split("/").pop() + location.search;
      if (href && href !== "#") { if (href.split("#")[0] === here.split("#")[0] || href.split("#")[0] === location.pathname.split("/").pop()) { location.hash = href.split("#")[1] || ""; this.loadBell(); document.getElementById("bellPanel").remove(); } else location.href = href; }
      else this.loadBell();
    });
    this.pushUI(document.getElementById("bpPush"));
  },

  // =================== phone notifications ===================
  VAPID: "BBD5qQkay4G_ZfaQDOxwndVlUrqrCtxA2UcceeC4-T9PNHEwVtSkVibxhMmuRT5RV-CMMH5JMim7F7u3Ht9xIow",
  pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; },
  isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); },
  isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; },
  registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
  },
  async pushSub() {
    if (!this.pushSupported()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  },
  async pushUI(box) {
    if (!box || !this.user) return;
    let h;
    if (!this.pushSupported()) {
      h = this.isIOS() && !this.isStandalone()
        ? '<div class="msg info">📲 For phone notifications on iPhone: tap Share → <b>Add to Home Screen</b>, open the site from the new icon, then turn them on here.</div>'
        : '<div class="msg info">This browser can\'t show phone notifications. Try Chrome.</div>';
    } else if (Notification.permission === "denied") {
      h = '<div class="msg warn">Notifications are blocked for this site. Allow them in the browser\'s site settings, then come back.</div>';
    } else {
      const sub = await this.pushSub().catch(() => null);
      h = sub && Notification.permission === "granted"
        ? '<div class="push-on">📲 Phone notifications are on <button class="linkbtn" data-push="off">Turn off</button></div>'
        : '<button class="btn gold sm block" data-push="on">📲 Turn on phone notifications</button>';
    }
    box.innerHTML = h;
    const b = box.querySelector("[data-push]");
    if (b) b.onclick = async () => {
      b.disabled = true;
      try { if (b.dataset.push === "on") await this.enablePush(); else await this.disablePush(); this.toast(b.dataset.push === "on" ? "Phone notifications on" : "Phone notifications off"); }
      catch (e) { this.toast(this.errText(e), "err"); }
      this.pushUI(box);
    };
  },
  async enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications were not allowed.");
    const reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob((this.VAPID + "=".repeat((4 - this.VAPID.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON();
    const { error } = await supabaseClient.rpc("save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agent: navigator.userAgent });
    if (error) throw error;
  },
  async disablePush() {
    const sub = await this.pushSub();
    if (!sub) return;
    await supabaseClient.rpc("remove_push", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  },

  // =================== messages ===================
  async loadMessages(filter) {
    let q = supabaseClient.from("messages").select("*").order("created_at").limit(2000);
    if (filter && filter.section_id) q = q.eq("section_id", filter.section_id);
    if (filter && filter.service_id) q = q.eq("service_id", filter.service_id);
    const r = await q;
    if (r.error) return [];
    const ids = [...new Set(r.data.map(m => m.sender))].filter(id => !(this.NAMES || {})[id]);
    if (ids.length) {
      const p = await supabaseClient.from("profiles").select("id, full_name, role").in("id", ids);
      this.NAMES = this.NAMES || {}; this.ROLES = this.ROLES || {};
      (p.data || []).forEach(x => { this.NAMES[x.id] = x.full_name; this.ROLES[x.id] = x.role; });
    }
    return r.data;
  },
  bubbles(msgs) {
    if (!msgs.length) return '<div class="chat-empty">No messages yet. Say hi 👋</div>';
    let last = "";
    return msgs.map(m => {
      const day = this.fmtDate(m.created_at, true), mine = m.sender === this.user.id;
      const team = (this.ROLES || {})[m.sender] === "admin";
      const sep = day !== last ? '<div class="chat-day">' + this.esc(day) + "</div>" : ""; last = day;
      return sep + '<div class="bub' + (mine ? " mine" : "") + (team && !mine ? " team" : "") + '"><div class="bub-who">' + this.esc(mine ? "You" : ((this.NAMES || {})[m.sender] || "")) + (team ? ' <span class="pill svc">WAREHOUSE</span>' : "") + "</div>" +
        '<div class="bub-txt" dir="auto">' + this.esc(m.body) + '</div><div class="bub-time">' + this.esc(new Date(m.created_at).toLocaleTimeString(this.loc(), { hour: "2-digit", minute: "2-digit" })) +
        (mine && (this.isAdmin() || Date.now() - new Date(m.created_at) < 900000) ? ' · <button class="linkbtn sm" data-mdel="' + m.id + '">delete</button>' : "") + "</div></div>";
    }).join("");
  },
  // a whole chat box; target = {section, service, reservation}
  chatHTML(id, msgs, small) {
    return '<div class="chat' + (small ? " small" : "") + '" id="' + id + '"><div class="chat-list">' + this.bubbles(msgs) + '</div>' +
      '<form class="chat-form"><textarea rows="1" placeholder="Write a message…" dir="auto"></textarea><button class="btn gold" type="submit">Send</button></form></div>';
  },
  bindChat(id, target, reload) {
    const box = document.getElementById(id); if (!box) return;
    const list = box.querySelector(".chat-list"), ta = box.querySelector("textarea");
    list.scrollTop = list.scrollHeight;
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !/Mobi/i.test(navigator.userAgent)) { e.preventDefault(); box.querySelector("form").requestSubmit(); } };
    box.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      const btn = box.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await supabaseClient.rpc("send_message", { p_section: target.section || null, p_service: target.service || null, p_reservation: target.reservation || null, p_body: body });
      btn.disabled = false;
      if (error) return this.toast(this.errText(error), "err");
      ta.value = ""; ta.style.height = "auto";
      reload();
    };
    box.querySelectorAll("[data-mdel]").forEach(b => b.onclick = async () => {
      if (!confirm("Delete this message?")) return;
      const { error } = await supabaseClient.rpc("delete_message", { p_id: Number(b.dataset.mdel) });
      if (error) return this.toast(this.errText(error), "err");
      reload();
    });
  },
  // comments under a request card: a toggle + thread
  OPENC: {},
  commentsHTML(resId, msgs) {
    const L = msgs.filter(m => m.reservation_id === resId), open = this.OPENC[resId];
    return '<div class="cmts"><button class="linkbtn" data-ctog="' + resId + '">💬 ' + (L.length ? "Comments (" + L.length + ")" : "Add a comment") + (open ? " ▲" : " ▼") + "</button>" +
      (open ? this.chatHTML("cm" + resId, L, true) : "") + "</div>";
  },
  bindComments(root, reload) {
    root.querySelectorAll("[data-ctog]").forEach(b => b.onclick = () => { const id = Number(b.dataset.ctog); this.OPENC[id] = !this.OPENC[id]; reload(false); });
    Object.keys(this.OPENC).filter(k => this.OPENC[k]).forEach(k => this.bindChat("cm" + k, { reservation: Number(k) }, () => reload(true)));
  },
};
