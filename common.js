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
  setLang(l) { this.lang = l; try { localStorage.setItem("basLang", l); } catch (e) {} },

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
      const p = await supabaseClient.from("profiles").select("id, full_name, role, approval_status, section_id").eq("id", this.user.id).single();
      this.profile = p.error ? null : p.data;
      if (this.isApproved()) {
        const st = await supabaseClient.from("settings").select("*").eq("id", 1).single();
        if (!st.error && st.data) this.settings = st.data;
        const sv = await supabaseClient.from("services").select("id, name_ar, name_en, is_active").order("id");
        if (!sv.error) this.services = sv.data || [];
      }
    }
    this.header(active);
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
      (this.user ? '<div class="me"><div class="who"><strong>' + this.esc(name) + "</strong><small>" + this.esc(tag) + '</small></div><button class="navbtn" id="logoutBtn">' + this.esc(this.t("Logout")) + "</button></div>" : "") +
      "</div>";
    const lo = document.getElementById("logoutBtn");
    if (lo) lo.onclick = async () => { await supabaseClient.auth.signOut(); location.href = "auth.html"; };
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
  fmtDate(d, withDay) {
    if (!d) return "";
    return this.d(d).toLocaleDateString("en-GB", withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  },
  fmtDateTime(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
  money(n) { return Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 }) + " EGP"; },

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
      "<small>" + this.esc(r.meeting_time || "") + " · " + this.esc(r.place || "") + "</small></h3>" +
      "<div>" + (this.isOverdue(r) ? '<span class="pill late">OVERDUE</span> ' : "") + (pre && this.isLate(r) ? '<span class="pill late">LATE</span> ' : "") + this.statusBadge(r.status) + "</div></div>" +
      '<div class="meta">Sent ' + this.esc(this.fmtDateTime(r.created_at)) + (r.requester ? " by " + this.esc(r.requester) : "") +
      (r.issued_at ? " · issued " + this.esc(this.fmtDateTime(r.issued_at)) + (r.received_by_name ? " to " + this.esc(r.received_by_name) : "") : "") +
      (r.return_by && this.OUT.indexOf(r.status) >= 0 ? " · return by <b>" + this.esc(this.fmtDate(r.return_by)) + "</b>" : "") +
      (r.returned_at ? " · back " + this.esc(this.fmtDateTime(r.returned_at)) : "") + "</div>" +
      '<div class="tscroll"><table class="ltable"><tr><th>Item</th><th class="num">Asked</th>' + (issued ? '<th class="num">Issued</th><th class="num">Back</th><th class="num">Missing</th><th class="num">Damaged</th><th class="num">Still out</th>' : "") + "</tr>" +
      r.items.map(i => '<tr><td><a class="lnk" href="item.html?id=' + i.item_id + '">' + this.esc(this.lineName(i)) + "</a>" + (i.kind === "Consumable" ? ' <small class="mut">(used up)</small>' : "") + '</td><td class="num">' + i.quantity + "</td>" +
        (issued ? '<td class="num">' + (i.issued_qty == null ? "—" : i.issued_qty) + '</td><td class="num">' + i.returned_qty + '</td><td class="num' + (i.missing_qty ? ' bad"><b>' + i.missing_qty + "</b>" : '">0') + '</td><td class="num' + (i.damaged_qty ? ' bad"><b>' + i.damaged_qty + "</b>" : '">0') +
          '</td><td class="num">' + (i.kind === "Consumable" && r.status !== "Issued" ? "used" : i.out) + "</td>" : "") + "</tr>").join("") + "</table></div>" +
      (r.notes ? '<div class="msg warn">' + this.esc(r.notes) + "</div>" : "") +
      (r.closed_reason ? '<div class="meta">Reason: ' + this.esc(r.closed_reason) + "</div>" : "") +
      (r.change ? '<div class="change-box">✏️ Change waiting for the warehouse team: ' + this.changeSummary(r, r.change, opts.stockBy || {}) + (r.change.reason ? " · <i>" + this.esc(r.change.reason) + "</i>" : "") + (opts.extraChange || "") + "</div>" : "") +
      (opts.actions ? '<div class="actions">' + opts.actions + "</div>" : "") +
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
  }
};
