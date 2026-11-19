// =========================================
// BAS WAREHOUSE: shared helpers for every page
// =========================================
"use strict";

const BAS = {
  user: null,      // Supabase auth user
  profile: null,   // row from public.profiles
  sections: [],
  services: [],
  settings: { min_days: 2, low_pct: 20, times: ["1:30 PM", "1:45 PM", "2:00 PM", "2:30 PM"] },

  CAT_ICONS: {
    Kashfy: "🪵", Crafts: "🎨", Games: "⚽", Kitchen: "🍳", Flags: "🚩",
    Camping: "⛺", Uniform: "👕", Tools: "🔧", Other: "📦"
  },

  icon(cat) { return this.CAT_ICONS[cat] || "📦"; },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  },

  serviceName(id) {
    const s = this.services.find(x => x.id === id);
    return s ? s.name_ar : "Church service";
  },

  // who borrowed: a stage, or another church service
  borrowerHTML(r) {
    if (r.service_id) return '<bdi dir="auto">' + this.esc(this.serviceName(r.service_id)) + '</bdi> <span class="pill rc">SERVICE</span>';
    return this.secHTML(r.section_id);
  },

  // section name safe for HTML, kept in its own direction so "#7" doesn't jump sides
  secHTML(id) { return '<bdi dir="auto">' + this.esc(this.sectionName(id)) + "</bdi>"; },

  isAdmin() { return !!(this.profile && this.profile.role === "admin" && this.profile.approval_status === "approved"); },
  isApproved() { return !!(this.profile && this.profile.approval_status === "approved"); },

  sectionName(id, lang) {
    const s = this.sections.find(x => x.id === id);
    if (!s) return "—";
    return lang === "en" ? s.name_en : s.name_ar;
  },

  // Load session, profile, sections, settings. Returns BAS.
  async init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    this.user = session ? session.user : null;

    const sec = await supabaseClient.from("sections").select("id, name_en, name_ar").order("id");
    if (!sec.error) this.sections = sec.data || [];

    if (this.user) {
      const p = await supabaseClient.from("profiles")
        .select("id, full_name, role, approval_status, section_id")
        .eq("id", this.user.id).single();
      this.profile = p.error ? null : p.data;
      if (this.isApproved()) {
        const st = await supabaseClient.from("settings").select("*").eq("id", 1).single();
        if (!st.error && st.data) this.settings = st.data;
        const sv = await supabaseClient.from("services").select("id, name_ar, name_en, is_active").order("id");
        if (!sv.error) this.services = sv.data || [];
      }
    }
    this.renderNav();
    return this;
  },

  // Fill the account area in the navbar
  renderNav() {
    const box = document.getElementById("navAccount");
    if (!box) return;
    document.querySelectorAll("[data-admin-only]").forEach(el => { el.hidden = !this.isAdmin(); });
    document.querySelectorAll("[data-approved-only]").forEach(el => { el.hidden = !this.isApproved(); });
    if (!this.user) {
      box.innerHTML = '<a href="auth.html" class="admin-btn">Login</a>';
      return;
    }
    const name = this.profile ? this.profile.full_name : this.user.email;
    const tag = this.isAdmin() ? "Ma5zan team" : (this.profile ? this.sectionName(this.profile.section_id) : "");
    box.innerHTML =
      '<div class="nav-user"><strong>' + this.esc(name) + '</strong><span>' + this.esc(tag) + '</span></div>' +
      '<button class="admin-btn ghost" type="button" id="logoutBtn">Logout</button>';
    document.getElementById("logoutBtn").onclick = async () => {
      await supabaseClient.auth.signOut();
      location.href = "index.html";
    };
  },

  // Send people who aren't allowed back to the login page
  requireApproved() {
    if (!this.user) { location.href = "auth.html?next=" + encodeURIComponent(location.pathname.split("/").pop()); return false; }
    if (!this.isApproved()) { location.href = "auth.html?pending=1"; return false; }
    return true;
  },

  requireAdmin() {
    if (!this.requireApproved()) return false;
    if (!this.isAdmin()) { location.href = "index.html"; return false; }
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

  // Turn a Supabase/Postgres error into a sentence people can read
  errText(e) {
    if (!e) return "Something went wrong.";
    const m = e.message || String(e);
    return m.replace(/^.*?ERROR:\s*/, "");
  },

  fmtDate(d, withDay) {
    if (!d) return "";
    const x = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
    return x.toLocaleDateString("en-GB", withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
  },

  fmtDateTime(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  },

  isLate(r) {
    if (!r.meeting_date || !r.created_at) return false;
    const made = new Date(r.created_at); made.setHours(0, 0, 0, 0);
    const need = new Date(r.meeting_date + "T00:00:00");
    return (need - made) / 86400000 < (this.settings.min_days || 0);
  },

  todayISO() {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },

  STATUS_LABEL: {
    Pending: "Waiting", Preparing: "Preparing", Ready: "Ready to collect", Issued: "Issued",
    "Partially Returned": "Partly returned", Returned: "Returned", Completed: "Completed",
    Cancelled: "Cancelled", Rejected: "Rejected"
  },

  statusSlug(s) { return String(s || "").toLowerCase().replace(/\s+/g, "-"); },

  statusBadge(s) {
    return '<span class="status status-' + this.statusSlug(s) + '">' + this.esc(this.STATUS_LABEL[s] || s) + "</span>";
  },

  isOverdue(r) {
    return (r.status === "Issued" || r.status === "Partially Returned") && r.return_by && r.return_by < this.todayISO();
  },

  // one line of a request as text: "Ribbons (Red) ×4"
  lineName(l) { return l.name + (l.variant ? " (" + l.variant + ")" : ""); },

  // Load reservations the current user may see, with their items joined
  async loadReservations(stockById) {
    const r = await supabaseClient.from("reservations")
      .select("id, section_id, service_id, requested_by, status, notes, meeting_date, meeting_time, place, created_at, prepared_at, ready_at, issued_at, received_by_name, return_by, returned_at, completed_at, closed_reason")
      .order("meeting_date", { ascending: false }).limit(500);
    if (r.error) throw r.error;
    const ids = r.data.map(x => x.id);
    let lines = [];
    if (ids.length) {
      const li = await supabaseClient.from("reservation_items")
        .select("id, reservation_id, item_id, variant_id, quantity, prepared_qty, prep_note, issued_qty, returned_qty, missing_qty, damaged_qty").in("reservation_id", ids);
      if (li.error) throw li.error;
      lines = li.data;
    }
    let names = {};
    if (this.isAdmin()) {
      const pr = await supabaseClient.from("profiles").select("id, full_name");
      if (!pr.error) pr.data.forEach(p => { names[p.id] = p.full_name; });
    } else if (this.profile) {
      names[this.profile.id] = this.profile.full_name;
    }
    return r.data.map(res => Object.assign(res, {
      requester: names[res.requested_by] || "",
      items: lines.filter(l => l.reservation_id === res.id).map(l => {
        const it = stockById && stockById[l.item_id];
        const v = it && l.variant_id ? (it.variants || []).find(x => x.id === l.variant_id) : null;
        return Object.assign(l, {
          name: it ? it.name_en : ("Item #" + l.item_id),
          variant: v ? v.name : (l.variant_id ? "colour #" + l.variant_id : ""),
          kind: it ? it.kind : "Returnable",
          out: Math.max(0, (l.issued_qty || 0) - l.returned_qty - l.missing_qty - l.damaged_qty)
        });
      })
    }));
  },

  async loadStock() {
    const s = await supabaseClient.rpc("item_stock");
    if (s.error) throw s.error;
    const byId = {};
    s.data.forEach(i => { byId[i.id] = i; });
    return { list: s.data, byId };
  }
};
