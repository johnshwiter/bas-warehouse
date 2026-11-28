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
  // access the warehouse team gives an account: all_stages, records_edit, group_money, announce, book_any
  can(k) { return this.isAdmin() || !!(this.isApproved() && this.profile.access && this.profile.access[k]); },
  allStages() { return this.can("all_stages"); },
  // Group records: the warehouse team and accounts it ticks ("Open Group records" or "Change the details")
  canRecords() { return this.can("records") || this.can("records_edit"); },
  groupRole() { return (this.profile && this.profile.group_role) || ""; },

  allSections: [],
  sectionName(id, lang) {
    const s = (this.allSections.length ? this.allSections : this.sections).find(x => x.id === id);
    if (!s) return "—";
    return lang === "en" ? s.name_en : s.name_ar;
  },
  allServices: [],
  serviceName(id) {
    const s = (this.allServices.length ? this.allServices : this.services).find(x => x.id === id);
    return s ? s.name_ar : "Church service";
  },
  // keep every service for names, but list only the ones not in Deleted
  setServices(list) { this.allServices = list || []; this.services = this.allServices.filter(x => !x.trashed); },
  // a stage or a church service, safe for HTML, kept in its own direction
  secHTML(id) { return '<bdi dir="auto">' + this.esc(this.sectionName(id)) + "</bdi>"; },
  borrowerName(secId, svcId, fb) { if (!secId && !svcId && fb) return fb; return svcId ? this.serviceName(svcId) : this.sectionName(secId); },
  borrowerHTML(r) {
    if (!r.section_id && !r.service_id) return '<bdi dir="auto">' + this.esc(r.who_name || "—") + "</bdi>";
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
    if (!this.profile.section_id) return this.allStages() ? "attendance.html" : this.canRecords() ? "records.html" : "profile.html";
    return "section.html";
  },

  async init(active) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    this.user = session ? session.user : null;
    let sec = await supabaseClient.from("sections").select("*").order("id");
    if (sec.error) sec = await supabaseClient.from("sections").select("id, name_en, name_ar, has_3eyal, is_active, att_late_min, att_late_absent, att_half_min, att_alert_pct, arif_every, arif_unit").order("id");
    if (sec.error) sec = await supabaseClient.from("sections").select("id, name_en, name_ar, has_3eyal, is_active, att_late_min, att_late_absent, att_half_min").order("id");
    if (sec.error) sec = await supabaseClient.from("sections").select("id, name_en, name_ar, has_3eyal, is_active, att_late_min, att_late_absent").order("id");
    if (sec.error) sec = await supabaseClient.from("sections").select("id, name_en, name_ar").order("id");
    if (!sec.error) { this.allSections = sec.data || []; this.sections = this.allSections.filter(x => x.is_active !== false); }
    if (this.user) {
      let p = await supabaseClient.from("profiles").select("id, full_name, role, approval_status, section_id, lang, stage_role, group_role, access, notif_off").eq("id", this.user.id).single();
      if (p.error) p = await supabaseClient.from("profiles").select("id, full_name, role, approval_status, section_id, lang, stage_role").eq("id", this.user.id).single();
      this.profile = p.error ? null : p.data;
      if (this.isApproved()) {
        const st = await supabaseClient.from("settings").select("*").eq("id", 1).single();
        if (!st.error && st.data) this.settings = st.data;
        let sv = await supabaseClient.from("services").select("id, name_ar, name_en, is_active, trashed").order("id");
        if (sv.error) sv = await supabaseClient.from("services").select("id, name_ar, name_en, is_active").order("id");
        if (!sv.error) this.setServices(sv.data);
      }
    }
    await this.loadUI();
    // page titles written as one phrase in Arabic (the English one is split in two parts)
    if (this.lang === "ar") document.querySelectorAll("h1[data-ar]").forEach(h => { h.innerHTML = h.dataset.ar; h.setAttribute("data-noi18n", ""); });
    this._active = active;
    if (document.body.hasAttribute("data-team") && this.isAdmin()) document.body.classList.add("team-ok");
    this.header(active);
    if (this.isApproved()) {
      this.askName(); this.greet(); this.checkRecent();
      if (active !== "profile") this.detailsNudge();
      supabaseClient.rpc("check_alerts").then(() => this.loadBell());
      supabaseClient.rpc("mark_delivered").then(() => {}); this._bd = setInterval(() => supabaseClient.rpc("mark_delivered").then(() => {}), 120000);
      if (this.profile.lang !== this.lang) supabaseClient.rpc("set_my_lang", { p_lang: this.lang }).then(() => {});
      clearInterval(this._bt); this._bt = setInterval(() => this.loadBell(), 60000);
    }
    this.registerSW();
    return this;
  },

  // ---------- top bar ----------
  // =================== top bar + side menu ===================
  menuGroups() {
    const mine = this.profile && this.profile.section_id, G = [];
    if (this.isAdmin()) {
      G.push({ t: "", items: [["overview", "team.html#overview", "Overview"], ["requests", "team.html#requests", "Requests"], ["book", "book.html", "Book items"], ["calendar", "calendar.html", "Calendar"], ["plan", "plan.html", "Meeting plans"],
        ["stock", "team.html#stock", "Stock"], ["ohda", "ohda.html", "Camps & 3ohda"], ["attendance", "attendance.html", "Attendance"], ["history", "history.html", "History"]] });
      G.push({ t: "Money", items: [["mizania", "mizania.html", "Mizania"], ["group", "mizania.html?fund=group", "Group money"], ["money", "team.html#money", "Compensation"]] });
      G.push({ t: "Warehouse", items: [["maint", "team.html#maint", "Maintenance"], ["wait", "team.html#wait", "Waitlist"]] });
      G.push({ t: "Messages", items: [["chat", "team.html#chat", "Messages"], ["news", "team.html#news", "Announcements"]] });
      G.push({ t: "People", items: [["records", "records.html", "Group records"], ["kada", "kada.html", "Kada attendance"]] });
      G.push({ t: "Team", items: [["people", "team.html#people", "Accounts"], ["trash", "team.html#trash", "Deleted"], ["log", "team.html#log", "Activity"], ["settings", "team.html#settings", "Settings"], ["help", "help.html", "Help"]] });
      if (mine) G.push({ t: "My stage", items: [["s-dash", "section.html?id=" + mine + "#dash", "My stage"], ["s-requests", "section.html?id=" + mine + "#requests", "Our requests"], ["s-chat", "section.html?id=" + mine + "#chat", "Stage chat"]] });
    } else if (this.isApproved()) {
      const grp = [];
      if (this.allStages()) grp.push(["attendance", "attendance.html", "Attendance"]);
      if (this.allStages() || this.groupRole()) grp.push(["kada", "kada.html", "Kada attendance"]);
      if (this.allStages() || this.can("plans_all")) grp.push(["plan", "plan.html", "Meeting plans"]);
      if (this.canRecords()) grp.push(["records", "records.html", "Group records"]);
      if (this.can("group_money")) grp.push(["group", "mizania.html?fund=group", "Group money"]);
      if (this.can("announce")) grp.push(["news", "news.html", "Announcements"]);
      if (this.can("plans_all") && !this.groupRole() && !this.allStages()) grp.push(["plan", "plan.html", "Meeting plans"]);
      if (this.groupRole() || this.allStages() || this.can("plans_all")) G.push({ t: this.groupRole() === "kada_3am" ? "القائد العام" : this.groupRole() === "mosa3ed_3am" ? "مساعد القائد العام" : "Group", items: grp });
      if (!mine) { G.push({ t: "More", items: [["profile", "profile.html", "Profile"], ["help", "help.html", "Help"]].concat(this.groupRole() || this.allStages() || !this.canRecords() ? [] : [["records", "records.html", "Group records"]]) }); return G; }
      G.push({ t: "My stage", items: [["s-dash", "section.html#dash", "Dashboard"], ["s-requests", "section.html#requests", "Requests"], ["s-history", "section.html#history", "History & search"],
        ["s-equipment", "section.html#equipment", "Equipment out / back"], ["s-money", "section.html#money", "Missing & compensation"], ["s-chat", "section.html#chat", "Messages"], ["s-wait", "section.html#wait", "Waitlist"]] });
      G.push({ t: "", items: [["plan", "plan.html", "Meeting plans"], ["ohda", "ohda.html", "Camps & 3ohda"]].concat(this.allStages() ? [] : [["attendance", "attendance.html", "Attendance"]]).concat(this.groupRole() || this.allStages() || !this.canRecords() ? [] : [["records", "records.html", "Group records"]]) });
      G.push({ t: "More", items: [["s-news", "section.html#news", "Announcements"], ["profile", "profile.html", "Profile"], ["help", "help.html", "Help"]] });
    }
    return G;
  },
  _badges: {},
  menuBadges(o) {
    Object.assign(this._badges, o || {});
    document.querySelectorAll(".drawer [data-mk]").forEach(a => { const n = this._badges[a.dataset.mk] || 0; const b = a.querySelector(".mb"); if (b) { b.textContent = n; b.hidden = !n; } });
    const dot = document.getElementById("menuDot"); if (dot) dot.hidden = !Object.keys(this._badges).some(k => this._badges[k] > 0);
  },
  dropRecent(h) {
    try { const L = JSON.parse(localStorage.getItem("basRecent") || "[]").filter(x => x.h !== h && !(h instanceof RegExp && h.test(x.h))); localStorage.setItem("basRecent", JSON.stringify(L)); } catch (e) {}
  },
  // remove recent requests/camps that no longer exist
  async checkRecent() {
    let L = []; try { L = JSON.parse(localStorage.getItem("basRecent") || "[]"); } catch (e) { return; }
    const ids = L.map(x => (x.h.match(/^camp\.html\?id=(\d+)/) || [])[1]).filter(Boolean).map(Number);
    if (!ids.length || !this.isApproved()) return;
    const r = await supabaseClient.from("reservations").select("id").in("id", ids);
    if (r.error) return;
    const have = new Set((r.data || []).map(x => x.id));
    const keep = L.filter(x => { const m = x.h.match(/^camp\.html\?id=(\d+)/) || x.h.match(/^book\.html\?edit=(\d+)/); return !m || have.has(Number(m[1])); });
    if (keep.length !== L.length) { localStorage.setItem("basRecent", JSON.stringify(keep)); this.header(this._active); }
  },
  addRecent(t, h) {
    try { let L = JSON.parse(localStorage.getItem("basRecent") || "[]").filter(x => x.h !== h); L.unshift({ t, h }); localStorage.setItem("basRecent", JSON.stringify(L.slice(0, 6))); } catch (e) {}
  },
  ICON_MORE: {
    plan: '<path d="M8 3h8v3H8z"/><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 11h8M8 15h5"/>',
    kada: '<circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6 1.5 0 2.8.5 3.9 1.4"/><path d="m14 18 2 2 4-4"/>',
    records: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M13 13h5M13 16.5h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', money: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    maint: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', wait: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>', news: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    people: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    log: '<path d="M4 6h16M4 12h16M4 18h10"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    equipment: '<path d="M7 7h10v10H7z"/><path d="M3 12h4M17 12h4"/>',
    group: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 14.3c.6-.2 1.3-.3 2-.3 3.3 0 6 2.7 6 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>'
  },
  menuIcon(k) {
    const b = k.replace(/^s-/, ""), I = this.ICONS[b === "dash" ? "stage" : b === "requests" ? "requests" : b] || this.ICONS[b];
    if (I) return I;
    const d = this.ICON_MORE[b]; return d ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>" : "";
  },
  header(active) {
    document.documentElement.dataset.theme = this.theme(); this.colorMeta(this.theme());
    this._active = active;
    let h = document.getElementById("top");
    if (!h) { h = document.createElement("header"); h.id = "top"; document.body.prepend(h); }
    const T = x => this.esc(this.tr ? this.tr(x) : this.t(x));
    const name = this.profile ? this.profile.full_name : (this.user ? this.user.email : "");
    const tag = this.isAdmin() ? this.t("Warehouse team") : this.groupRole() ? (this.groupRole() === "kada_3am" ? "القائد العام" : "مساعد القائد العام") : (this.profile && this.profile.section_id ? this.sectionName(this.profile.section_id) : "");
    const ok = this.isApproved();
    h.className = "topbar";
    h.innerHTML = '<div class="topbar-in">' + (this.user ? '<button class="menubtn" id="menuBtn" aria-label="' + T("Menu") + '"><span></span><span></span><span></span><i class="mdot" id="menuDot" hidden></i></button>' : "") +
      '<a class="brand" href="' + this.homeURL() + '"><img src="logo.png" alt="BAS"><div><b>BI ARCHI ANGELOUS</b><span>BAS</span></div></a>' +
      (ok ? '<div class="gsearch"><input id="gq" type="search" placeholder="Search everything…" aria-label="Search everything" autocomplete="off"><div id="gres" class="gres" hidden></div></div>' : "") +
      (ok ? '<button class="bell" id="bellBtn" aria-label="Notifications">🔔<span class="bdg" id="bellN" hidden></span></button>' : "") + "</div>";
    // side menu
    let dr = document.getElementById("drawer");
    if (dr) dr.remove(); const old = document.getElementById("drawerBg"); if (old) old.remove();
    if (this.user) {
      const here = location.pathname.split("/").pop() || "index.html", hash = location.hash || "";
      const isOn = href => { const [p, hs] = href.split("#"); const pp = p.split("?")[0], qs = p.split("?")[1] || ""; return pp === here && (qs === location.search.slice(1) || (!qs && !/fund=/.test(location.search))) && (!hs || ("#" + hs) === hash || (!hash && /#(overview|dash)$/.test(href))); };
      let recent = []; try { recent = JSON.parse(localStorage.getItem("basRecent") || "[]"); } catch (e) {}
      const item = x => '<a href="' + x[1] + '" data-mk="' + x[0] + '" data-k="' + this.esc(this.norm((this.tr ? this.tr(x[2]) : x[2]) + " " + x[2])) + '"' + (isOn(x[1]) ? ' class="on"' : "") + ">" + this.menuIcon(x[0]) + "<span>" + T(x[2]) + '</span><b class="mb" hidden></b></a>';
      const bg = document.createElement("div"); bg.id = "drawerBg"; bg.className = "drawer-bg"; document.body.appendChild(bg);
      dr = document.createElement("aside"); dr.id = "drawer"; dr.className = "drawer"; dr.setAttribute("aria-label", "Menu");
      dr.innerHTML = '<div class="dr-top"><a class="dr-me" href="profile.html"><strong>' + this.esc(name) + "</strong><small>" + this.esc(tag) + '</small></a><button class="dr-x" id="drX" aria-label="Close">✕</button></div>' +
        (ok ? '<div class="dr-find"><input id="drQ" type="search" placeholder="' + T("Find in the menu…") + '" autocomplete="off"></div>' +
          '<div class="dr-new"><a class="btn gold" href="book.html">+ ' + T("New booking") + '</a><a class="btn line" href="camp.html?new=Camp">⛺ ' + T("New camp / trip") + "</a></div>" : "") +
        '<nav class="dr-list">' + this.menuGroups().map(g => '<div class="dr-g">' + (g.t ? "<h5>" + T(g.t) + "</h5>" : "") + g.items.map(item).join("") + "</div>").join("") +
        (recent.length ? '<div class="dr-g dr-recent"><h5>' + T("Recent") + "</h5>" + recent.map(r => '<a href="' + this.esc(r.h) + '" data-k="' + this.esc(this.norm(r.t)) + '"><span dir="auto">' + this.esc(r.t) + "</span></a>").join("") + "</div>" : "") + "</nav>" +
        '<div class="dr-foot">' + (this.isAdmin() ? '<button id="editBtn" class="dr-btn">✏️ ' + T(this.editMode() ? "Leave edit mode" : "Edit mode") + "</button>" : "") + '<button id="themeBtn" class="dr-btn">' + (this.theme() === "dark" ? "☀️ " + T("Light mode") : "🌙 " + T("Dark mode")) + '</button><button id="logoutBtn" class="dr-btn">↪ ' + T("Logout") + "</button></div>";
      document.body.appendChild(dr);
      const open = v => { document.body.classList.toggle("menu-open", v); if (v) { const q = document.getElementById("drQ"); if (q && window.innerWidth > 860) q.focus(); } };
      document.getElementById("menuBtn").onclick = () => open(!document.body.classList.contains("menu-open"));
      const eb = document.getElementById("editBtn");
      if (eb) eb.onclick = () => { try { if (this.editMode()) sessionStorage.removeItem("basEdit"); else sessionStorage.setItem("basEdit", "1"); } catch (e) {} location.reload(); };
      bg.onclick = () => open(false); document.getElementById("drX").onclick = () => open(false);
      document.addEventListener("keydown", e => { if (e.key === "Escape") open(false); });
      dr.querySelectorAll("a").forEach(a => a.addEventListener("click", () => open(false)));
      const q = document.getElementById("drQ");
      if (q) q.oninput = () => { const v = this.norm(q.value); dr.querySelectorAll(".dr-g").forEach(g => { let any = false; g.querySelectorAll("a[data-k]").forEach(a => { const hit = !v || a.dataset.k.includes(v); a.hidden = !hit; any = any || hit; }); g.hidden = !any; }); };
      window.addEventListener("hashchange", () => { const hh = location.hash; dr.querySelectorAll("a[data-mk]").forEach(a => { const [p, hs] = a.getAttribute("href").split("#"); a.classList.toggle("on", p.split("?")[0] === here && hs && "#" + hs === hh); }); });
      this.menuBadges();
    }
    const lo = document.getElementById("logoutBtn");
    if (lo) lo.onclick = async () => { await supabaseClient.auth.signOut(); location.href = "auth.html"; };
    const bb = document.getElementById("bellBtn");
    if (bb) bb.onclick = e => { e.stopPropagation(); this.toggleBell(); };
    const tb = document.getElementById("themeBtn");
    if (tb) tb.onclick = () => { this.setTheme(this.theme() === "dark" ? "light" : "dark"); tb.textContent = this.theme() === "dark" ? "☀️ " + (this.tr ? this.tr("Light mode") : "Light mode") : "🌙 " + (this.tr ? this.tr("Dark mode") : "Dark mode"); };
    const gq = document.getElementById("gq");
    if (gq) this.bindSearch(gq);
    this.samsungTip();
  },
  // Samsung Internet paints sites dark by itself and a site can't switch that off; show how to turn it off once
  samsungTip() {
    try {
      if (!/SamsungBrowser/i.test(navigator.userAgent) || this.theme() === "dark" || localStorage.getItem("basSamsungTip") === "1") return;
      if (!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches)) return;
      if (document.getElementById("ssTip")) return;
      const T = x => this.esc(this.tr ? this.tr(x) : x);
      const d = document.createElement("div"); d.id = "ssTip"; d.className = "sstip";
      d.innerHTML = "<b>" + T("Colours look dark or wrong?") + "</b> " + T("Samsung Internet is painting the site dark. In Samsung Internet: ☰ menu → Settings → Labs → turn on “Use website dark theme”. Or turn off Dark mode in the ☰ menu.") +
        ' <button class="linkbtn" id="ssOk">' + T("Got it") + "</button>";
      const top = document.getElementById("top"); top.after(d);
      document.getElementById("ssOk").onclick = () => { localStorage.setItem("basSamsungTip", "1"); d.remove(); };
    } catch (e) {}
  },

  // =================== icons, theme, welcome ===================
  ICONS: (function () {
    const i = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
    return {
      overview: i('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
      requests: i('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
      book: i('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>'),
      calendar: i('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
      stock: i('<path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>'),
      ohda: i('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14c2 .7 3 2.8 3 6"/>'),
      mizania: i('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>'),
      stage: i('<path d="M3 20 12 5l9 15z"/><path d="M12 5v15M9 20l3-5 3 5"/>'),
      attendance: i('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m8.5 12.5 2.2 2.2 4.8-4.8"/>'),
      profile: i('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>')
    };
  })(),
  theme() { try { return localStorage.getItem("basTheme") === "dark" ? "dark" : "light"; } catch (e) { return "light"; } },
  setTheme(t) { try { localStorage.setItem("basTheme", t); } catch (e) {} document.documentElement.dataset.theme = t; this.colorMeta(t); },
  // tell the browser (Samsung Internet, Chrome "auto dark") not to repaint the page in its own dark mode
  colorMeta(t) {
    let m = document.querySelector('meta[name="color-scheme"]');
    if (!m) { m = document.createElement("meta"); m.name = "color-scheme"; document.head.appendChild(m); }
    m.content = t === "dark" ? "only dark" : "only light";
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = t === "dark" ? "#090A28" : "#17196A";
  },
  firstName() { const n = (this.profile && this.profile.full_name) || ""; return /@/.test(n) ? "" : n.trim().split(/\s+/)[0]; },
  welcomeText() { const n = this.firstName(); return (this.tr ? this.tr("Welcome") : "Welcome") + (n ? (this.lang === "ar" ? "، " : ", ") + n : "") + " 👋"; },
  // a person whose name is still their email is asked for their real name once
  askName() {
    if (!this.profile || (this.profile.full_name && !/@/.test(this.profile.full_name))) return;
    const o = document.createElement("div"); o.className = "overlay";
    const T = x => this.tr ? this.tr(x) : x;
    o.innerHTML = '<div class="sheet" style="max-width:440px"><h2>' + this.esc(T("Welcome")) + ' 👋</h2><p class="sub">' + this.esc(T("What's your name? Everyone will see it on requests and in the chat.")) + '</p>' +
      '<div class="field"><label>' + this.esc(T("Full name")) + '</label><input id="nmIn" autocomplete="name"></div><div id="nmErr" class="msg err" hidden></div><div class="actions"><button class="btn gold" id="nmGo">' + this.esc(T("Save")) + "</button></div></div>";
    document.body.appendChild(o);
    document.getElementById("nmGo").onclick = async () => {
      const v = document.getElementById("nmIn").value.trim();
      if (v.length < 2) { const e = document.getElementById("nmErr"); e.textContent = T("Write your name."); e.hidden = false; return; }
      const { error } = await supabaseClient.rpc("update_my_name", { p_full_name: v });
      if (error) { const e = document.getElementById("nmErr"); e.textContent = this.errText(error); e.hidden = false; return; }
      this.profile.full_name = v; o.remove(); this.header(this._active); this.toast(this.welcomeText());
    };
  },
  greet() {
    const k = (this.user && this.user.id) + ":" + ((this.user && this.user.last_sign_in_at) || "");
    let seen = false; try { seen = localStorage.getItem("basHi") === k; localStorage.setItem("basHi", k); } catch (e) {}
    if (!seen && this.firstName()) setTimeout(() => this.toast(this.welcomeText()), 400);
  },

  // =================== search everything ===================
  norm(s) { return String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim(); },
  async searchIndex() {
    if (this._idx) return this._idx;
    const idx = [];
    try {
      const st = await supabaseClient.rpc("item_stock");
      (st.data || []).forEach(i => idx.push({ g: "Items", t: i.name_en + (i.name_ar ? " · " + i.name_ar : ""), s: (i.category || "") + (i.counted ? " · " + i.available + " available" : ""), h: "item.html?id=" + i.id, k: this.norm(i.name_en + " " + (i.name_ar || "") + " " + (i.category || "")) }));
    } catch (e) {}
    this.sections.filter(x => this.isAdmin() || x.id === this.profile.section_id).forEach(x => idx.push({ g: "Stages", t: x.name_ar + " · " + x.name_en, h: this.isAdmin() ? "section.html?id=" + x.id : "section.html", k: this.norm(x.name_ar + " " + x.name_en) }));
    if (this.isAdmin()) {
      this.services.forEach(x => idx.push({ g: "Services", t: x.name_ar + (x.name_en && x.name_en !== x.name_ar ? " · " + x.name_en : ""), h: "section.html?service=" + x.id, k: this.norm(x.name_ar + " " + x.name_en) }));
      const p = await supabaseClient.from("profiles").select("id, full_name, email, section_id, role, approval_status");
      (p.data || []).filter(x => x.approval_status !== "removed").forEach(x => idx.push({ g: "People", t: x.full_name, s: (x.role === "admin" ? "Warehouse team" : "") + (x.section_id ? " " + this.sectionName(x.section_id) : "") + (x.email ? " · " + x.email : ""), h: "team.html#people", k: this.norm(x.full_name + " " + (x.email || "")) }));
    }
    const ro = await supabaseClient.from("roster").select("id, name, name_ar, role, section_id").eq("is_active", true);
    (ro.data || []).forEach(x => idx.push({ g: "People", t: x.name, s: (x.role === "kada" ? "Kada" : "Scout") + " · " + this.sectionName(x.section_id), h: "ohda.html?q=" + encodeURIComponent(x.name), k: this.norm(x.name + " " + (x.name_ar || "")) }));
    this._idx = idx;
    return idx;
  },
  bindSearch(inp) {
    const box = document.getElementById("gres");
    let timer;
    const close = () => { box.hidden = true; };
    inp.onfocus = () => { this.searchIndex(); if (inp.value.trim()) run(); };
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
    inp.onkeydown = e => {
      if (e.key === "Escape") { inp.value = ""; close(); inp.blur(); }
      if (e.key === "Enter") { const a = box.querySelector("a"); if (a) location.href = a.getAttribute("href"); }
    };
    document.addEventListener("click", e => { if (!e.target.closest(".gsearch")) close(); });
    const run = async () => {
      const q = this.norm(inp.value);
      if (!q) { close(); return; }
      const idx = await this.searchIndex();
      let res = [];
      const num = q.replace(/^#/, "");
      if (/^\d+$/.test(num)) {
        const r = await supabaseClient.from("reservations").select("id, section_id, service_id, meeting_date, status, place").eq("id", Number(num));
        (r.data || []).forEach(x => res.push({ g: "Requests", t: "#" + x.id + " · " + this.borrowerName(x.section_id, x.service_id, x.who_name), s: this.fmtDate(x.meeting_date) + " · " + (this.STATUS_LABEL[x.status] || x.status) + " · " + (x.place || ""),
          h: (this.isAdmin() ? this.borrowerURL(x.section_id, x.service_id) + "&" : "section.html?") + "q=" + x.id + "#history" }));
      }
      res = res.concat(idx.filter(x => x.k.includes(q)).slice(0, 30));
      const groups = {};
      res.forEach(x => { (groups[x.g] = groups[x.g] || []).push(x); });
      box.innerHTML = res.length ? Object.keys(groups).map(g => '<div class="gres-g">' + this.esc(this.tr ? this.tr(g) : g) + "</div>" + groups[g].slice(0, 8).map(x =>
        '<a href="' + this.esc(x.h) + '"><b dir="auto">' + this.esc(x.t) + "</b>" + (x.s ? '<small dir="auto">' + this.esc(x.s) + "</small>" : "") + "</a>").join("")).join("")
        : '<div class="gres-none">' + this.esc(this.tr ? this.tr("Nothing found.") : "Nothing found.") + "</div>";
      box.hidden = false;
    };
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
    this._tt = setTimeout(() => { t.className = "toast " + (kind || ""); }, 5000);
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
    Pending: "Waiting", Preparing: "Preparing", Ready: "Ready to collect", Issued: "With the stage",
    "Partially Returned": "Partly returned", Returned: "Returned", Completed: "Completed", Cancelled: "Cancelled", Rejected: "Rejected"
  },
  statusSlug(s) { return String(s || "").toLowerCase().replace(/\s+/g, "-"); },
  statusBadge(s) { return '<span class="status status-' + this.statusSlug(s) + '">' + this.esc(this.STATUS_LABEL[s] || s) + "</span>"; },

  lineName(l) { return l.name + (l.variant ? " (" + l.variant + ")" : ""); },
  linkify(t) { return this.esc(t).replace(/https?:\/\/[^\s<]+/g, u => '<a class="lnk" href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"); },
  itemLabel(stockBy, itemId, varId) {
    const it = stockBy[itemId]; if (!it) return "Item #" + itemId;
    const v = varId ? (it.variants || []).find(x => x.id === varId) : null;
    return this.itemName(it) + (v ? " (" + v.name + ")" : "");
  },
  itemName(it) { return it ? (this.lang === "ar" && it.name_ar ? it.name_ar : it.name_en) : ""; },
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
      .select("id, section_id, service_id, requested_by, status, notes, meeting_date, meeting_time, place, created_at, prepared_at, ready_at, issued_at, received_by_name, return_by, returned_at, completed_at, closed_reason, kind, end_date, phase2_at, kids_count")
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
          name: it ? this.itemName(it) : "Item #" + l.item_id,
          variant: v ? v.name : (l.variant_id ? "colour #" + l.variant_id : ""),
          kind: it ? it.kind : "Returnable",
          out: Math.max(0, (l.issued_qty || 0) - l.returned_qty - l.missing_qty - l.damaged_qty)
        });
      })
    }));
  },

  // calendar event → its camp page, or a button to book items for it
  eventLinks(e) {
    const t = x => this.tr ? this.tr(x) : x;
    if (e.reservation_id) return ' <a class="btn sm" href="camp.html?id=' + e.reservation_id + '">' + this.esc(t("Open camp page")) + " (#" + e.reservation_id + ")</a>";
    const can = this.isAdmin() || (e.section_id && e.section_id === (this.profile || {}).section_id);
    if ((e.kind === "Camp" || e.kind === "Trip") && can) return ' <a class="btn gold sm" href="book.html?event=' + e.id + '">' + this.esc(t("📦 Book items for this")) + "</a>";
    return "";
  },

  // camps and trips: dates + phase 2 status + link
  tripLine(r) {
    if (!r.kind || r.kind === "Meeting") return "";
    const open = ["Cancelled", "Rejected"].indexOf(r.status) < 0;
    return '<div class="trip"><span class="pill ' + (r.kind === "Camp" ? "ok" : "fix") + '">' + this.esc(r.kind === "Camp" ? "⛺ CAMP" : "🚌 TRIP") + "</span> " +
      (r.end_date ? '<span class="mut">' + this.esc(this.fmtDate(r.meeting_date, true)) + " → " + this.esc(this.fmtDate(r.end_date, true)) + "</span> " : "") +
      (r.phase2_at ? '<span class="pill ok">PHASE 2 ✓</span>' : open ? '<span class="pill late">PHASE 2 MISSING</span>' : "") +
      ' <a class="lnk" href="camp.html?id=' + r.id + '">' + this.esc(this.tr ? this.tr("Who is going & 3ohda") : "Who is going & 3ohda") + " ›</a></div>";
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
    const issued = ["Issued", "Partially Returned", "Returned", "Completed"].indexOf(r.status) >= 0; const anyM = r.items.some(i => i.missing_qty), anyD = r.items.some(i => i.damaged_qty);
    const pre = this.PRE.indexOf(r.status) >= 0;
    const h = '<div class="req ' + this.statusSlug(r.status) + '" id="req' + r.id + '">' +
      '<div class="req-top"><h3>' + (opts.showBorrower ? this.borrowerHTML(r) + " · " : "") + "#" + r.id + " · " + this.esc(this.fmtDate(r.meeting_date, true)) +
      "<small><bdi>" + this.esc(this.time(r.meeting_time)) + "</bdi> · <bdi>" + this.esc(r.place || "") + "</bdi></small></h3>" +
      "<div>" + (this.isOverdue(r) ? '<span class="pill late">OVERDUE</span> ' : "") + (pre && this.isLate(r) ? '<span class="pill late">LATE</span> ' : "") + this.statusBadge(r.status) + "</div></div>" +
      this.tripLine(r) +
      '<div class="meta">Sent ' + this.esc(this.fmtDateTime(r.created_at)) + (r.requester ? " by " + this.esc(r.requester) : "") +
      (r.issued_at ? " · taken " + this.esc(this.fmtDate(r.issued_at)) + (r.received_by_name ? " by " + this.esc(r.received_by_name) : "") : "") +
      (r.status === "Ready" ? " · counts as taken on <b>" + this.esc(this.fmtDate(r.meeting_date, true)) + "</b>" : "") +
      (r.return_by && this.OUT.indexOf(r.status) >= 0 ? " · return by <b>" + this.esc(this.fmtDate(r.return_by)) + "</b>" : "") +
      (r.returned_at ? " · back " + this.esc(this.fmtDateTime(r.returned_at)) : "") + "</div>" +
      '<div class="tscroll"><table class="ltable"><tr><th>Item</th><th class="num">Asked</th>' + (issued ? '<th class="num">Taken</th><th class="num">Back</th>' + (anyM ? '<th class="num">Missing</th>' : "") + (anyD ? '<th class="num">Damaged</th>' : "") + '<th class="num">Still out</th>' : "") + "</tr>" +
      r.items.map(i => '<tr><td><a class="lnk" href="item.html?id=' + i.item_id + '">' + this.esc(this.lineName(i)) + "</a>" + (i.kind === "Consumable" ? ' <small class="mut">(used up)</small>' : "") + '</td><td class="num">' + i.quantity + "</td>" +
        (issued ? '<td class="num">' + (i.issued_qty == null ? "—" : i.issued_qty) + '</td><td class="num">' + i.returned_qty + "</td>" + (anyM ? '<td class="num' + (i.missing_qty ? ' bad"><b>' + i.missing_qty + "</b>" : '">0') + "</td>" : "") + (anyD ? '<td class="num' + (i.damaged_qty ? ' bad"><b>' + i.damaged_qty + "</b>" : '">0') + "</td>" : "") +
          '<td class="num">' + (i.kind === "Consumable" && r.status !== "Issued" ? "used" : i.out) + "</td>" : "") + "</tr>").join("") + "</table></div>" +
      (r.notes ? '<div class="msg warn" data-noi18n dir="auto">' + this.esc(r.notes) + "</div>" : "") +
      (r.closed_reason ? '<div class="meta">Reason: ' + this.esc(r.closed_reason) + "</div>" : "") +
      (r.change ? '<div class="change-box">✏️ Change waiting for the warehouse team: ' + this.changeSummary(r, r.change, opts.stockBy || {}) + (r.change.reason ? " · <i>" + this.esc(r.change.reason) + "</i>" : "") + (opts.extraChange || "") + "</div>" : "") +
      (opts.actions ? '<div class="actions">' + opts.actions + "</div>" : "") +
      (opts.msgs ? this.commentsHTML(r.id, opts.msgs) : "") +
      "</div>";
    return h;
  },

  // camps: who had the missing piece (their 3ohda didn't all come back)
  LOSSWHO: {},
  async loadLossWho(losses) {
    const ids = [...new Set(losses.filter(l => l.reservation_id).map(l => l.reservation_id))];
    if (!ids.length) return;
    try {
      const cu = await this.q(supabaseClient.from("custody").select("reservation_id, item_id, variant_id, qty, returned_qty, person_id").in("reservation_id", ids));
      const short = cu.filter(c => c.returned_qty < c.qty);
      if (!short.length) return;
      const tp = await this.q(supabaseClient.from("trip_people").select("id, name").in("id", [...new Set(short.map(c => c.person_id))]));
      const nm = {}; tp.forEach(p => { nm[p.id] = p.name; });
      losses.forEach(l => {
        const L = short.filter(c => c.reservation_id === l.reservation_id && c.item_id === l.item_id && (c.variant_id || null) === (l.variant_id || null));
        if (L.length) this.LOSSWHO[l.id] = L.map(c => (nm[c.person_id] || "?") + (c.qty - c.returned_qty > 1 ? " ×" + (c.qty - c.returned_qty) : "")).join("، ");
      });
    } catch (e) {}
  },
  // missing/damaged lines with what is paid; works for one stage, one service, or everyone
  lossTable(losses, stockBy, opts) {
    opts = opts || {};
    if (!losses.length) return '<div class="empty">Nothing missing or damaged. 👌</div>';
    return '<div class="panel tscroll"><table class="ltable"><tr><th>Date</th>' + (opts.who ? "<th>Stage / service</th>" : "") + '<th>Item</th><th>Kind</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th class="num">Paid</th><th>Status</th><th>Request</th>' + (opts.admin ? "<th></th>" : "") + "</tr>" +
      losses.map(l => "<tr><td class=\"nowrap\">" + this.esc(this.fmtDate(l.occurred_on)) + "</td>" +
        (opts.who ? '<td><a class="lnk" href="' + this.borrowerURL(l.section_id, l.service_id) + '"><bdi>' + this.esc(this.borrowerName(l.section_id, l.service_id, l.who_name)) + "</bdi></a></td>" : "") +
        '<td><a class="lnk" href="item.html?id=' + l.item_id + '">' + this.esc(this.itemLabel(stockBy, l.item_id, l.variant_id)) + "</a>" + (l.note ? '<br><small class="mut">' + this.esc(l.note) + "</small>" : "") + (this.LOSSWHO[l.id] ? '<br><small class="who-had">👤 ' + this.esc(this.LOSSWHO[l.id]) + "</small>" : "") + "</td>" +
        "<td>" + (l.kind === "missing" ? '<span class="pill bad">MISSING</span>' : '<span class="pill warn">DAMAGED</span>') + '</td><td class="num">' + l.qty + "</td>" +
        '<td class="num">' + (opts.admin ? '<input type="number" min="0" value="' + Number(l.unit_price) + '" data-lp="' + l.id + '">' : Number(l.unit_price)) + '</td><td class="num"><b>' + Number(l.amount) + '</b></td><td class="num">' + Number(l.paid) + "</td>" +
        "<td>" + (Number(l.amount) <= 0 ? '<span class="pill mut">NO PRICE</span>' : l.settled ? '<span class="pill ok">PAID</span>' : '<span class="pill late">' + Number(l.remaining) + " LEFT</span>") + "</td>" +
        "<td>" + (l.reservation_id ? "#" + l.reservation_id : "—") + "</td>" +
        (opts.admin ? '<td class="nowrap"><button class="btn line sm" data-lsave="' + l.id + '">Save price</button> ' + (opts.edit ? '<button class="btn line sm" data-ledit="' + l.id + '">Edit</button> <button class="btn danger sm" data-ldel="' + l.id + '">Delete</button> ' : "") + (!l.settled && Number(l.amount) > 0 ? '<button class="btn ok sm" data-lpaid="' + l.id + '">Paid ✓</button>' : "") + "</td>" : "") +
        "</tr>").join("") + "</table></div>";
  },

  // things to show on a calendar: pickups, return dates, events
  calItems(res, events, withBorrower) {
    const out = [];
    const who = r => withBorrower ? " \u2068" + this.borrowerName(r.section_id, r.service_id, r.who_name) + "\u2069" : "";
    res.forEach(r => {
      if (r.status === "Cancelled" || r.status === "Rejected") return;
      out.push({ date: r.meeting_date, cls: "pick", ref: { res: r.id }, text: "📦 #" + r.id + who(r),
        title: "Pickup #" + r.id + " · " + this.borrowerName(r.section_id, r.service_id, r.who_name) + " · " + (r.meeting_time || "") + " · " + r.items.map(i => this.lineName(i) + " ×" + i.quantity).join(", ") });
      if (r.end_date && r.end_date > r.meeting_date && !(events || []).some(e => e.reservation_id === r.id)) {
        const d = this.d(r.meeting_date); d.setDate(d.getDate() + 1);
        for (; this.isoOf(d) <= r.end_date; d.setDate(d.getDate() + 1)) out.push({ date: this.isoOf(d), cls: r.kind === "Camp" ? "camp" : "trip", ref: { res: r.id }, text: (r.kind === "Camp" ? "⛺ #" : "🚌 #") + r.id + who(r), title: r.kind + " #" + r.id });
      }
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
    this.NAMES = this.NAMES || {};
    r.data.forEach(m => { if (m.sender_name && !this.NAMES[m.sender]) this.NAMES[m.sender] = m.sender_name; m.reacts = []; m.reads = []; });
    // reactions and delivered / seen
    if (r.data.length) {
      const x = await supabaseClient.rpc("msg_extras", { p_ids: r.data.map(m => m.id) });
      if (!x.error && x.data) {
        const by = {}; r.data.forEach(m => { by[m.id] = m; });
        (x.data.reactions || []).forEach(e => { if (by[e.m]) by[e.m].reacts.push(e); });
        (x.data.reads || []).forEach(e => { if (by[e.m] && e.p !== by[e.m].sender) by[e.m].reads.push(e); });
      }
    }
    this._msgx = this._msgx || {}; r.data.forEach(m => { this._msgx[m.id] = m; });
    return r.data;
  },
  bubbles(msgs) {
    if (!msgs.length) return '<div class="chat-empty">No messages yet. Say hi 👋</div>';
    let last = "";
    const t = x => this.tr ? this.tr(x) : x;
    return msgs.map(m => {
      const day = this.fmtDate(m.created_at, true), mine = m.sender === this.user.id, team = !!m.sender_team;
      const sep = day !== last ? '<div class="chat-day">' + this.esc(day) + "</div>" : ""; last = day;
      const time = this.esc(new Date(m.created_at).toLocaleTimeString(this.loc(), { hour: "2-digit", minute: "2-digit" }));
      if (m.deleted_at) return sep + '<div class="bub deleted' + (mine ? " mine" : "") + '"><div class="bub-txt">🗑 ' + this.esc((m.deleted_by_name || "") + " " + t("deleted a message")) + '</div><div class="bub-time">' + time + "</div></div>";
      const imgs = (m.images || []);
      const p = m.reply_to ? msgs.find(x => x.id === m.reply_to) : null;
      const quote = p ? '<div class="bub-quote" data-jump="' + p.id + '"><b>' + this.esc(p.sender === this.user.id ? t("You") : (p.sender_name || "")) + "</b><span dir=\"auto\">" +
        this.esc(p.deleted_at ? t("deleted a message") : (p.body || (p.images && p.images.length ? "📷" : ""))).slice(0, 120) + "</span></div>" : "";
      const can = mine || this.isAdmin(), pin = !!m.pinned_at;
      return sep + '<div class="bub' + (mine ? " mine" : "") + (team && !mine ? " team" : "") + (pin ? " pinned" : "") + '" id="msg' + m.id + '"><div class="bub-who">' + (pin ? "📌 " : "") + this.esc(mine ? t("You") : (m.sender_name || (this.NAMES || {})[m.sender] || "")) + (team ? ' <span class="pill svc">WAREHOUSE</span>' : "") + "</div>" + quote +
        (imgs.length ? '<div class="bub-imgs n' + imgs.length + '">' + imgs.map(p => '<img alt="photo" data-img="' + this.esc(p) + '">').join("") + "</div>" : "") +
        (m.body ? '<div class="bub-txt" dir="auto">' + this.esc(m.body) + "</div>" : "") + this.reactsHTML(m) + '<div class="bub-time">' + time + (m.edited_at ? " · " + this.esc(t("edited")) : "") +
        " " + this.ticksHTML(m) + ' · <button class="linkbtn sm" data-mreact="' + m.id + '" aria-label="React">☺+</button>' +
        ' · <button class="linkbtn sm" data-mrep="' + m.id + '">' + this.esc(t("reply")) + "</button>" +
        (!pin ? ' · <button class="linkbtn sm" data-mpin="' + m.id + '" data-on="1">' + this.esc(t("pin")) + "</button>" : (this.isAdmin() || m.pinned_by === this.user.id) ? ' · <button class="linkbtn sm" data-mpin="' + m.id + '" data-on="0">' + this.esc(t("unpin")) + "</button>" : "") +
        (can && m.body ? ' · <button class="linkbtn sm" data-medit="' + m.id + '">' + this.esc(t("edit")) + "</button>" : "") +
        (can ? ' · <button class="linkbtn sm" data-mdel="' + m.id + '">' + this.esc(t("delete")) + "</button>" : "") + "</div></div>";
    }).join("");
  },
  // photos are private: get short-lived links for the ones on screen
  _img: {},
  async fillImages(root) {
    const els = [...root.querySelectorAll("img[data-img]:not([src])")];
    if (!els.length) return;
    const need = [...new Set(els.map(e => e.dataset.img).filter(p => !this._img[p]))];
    if (need.length) {
      const r = await supabaseClient.storage.from("chat").createSignedUrls(need, 3600);
      (r.data || []).forEach(x => { if (x.signedUrl) this._img[x.path] = x.signedUrl; });
    }
    els.forEach(e => { if (this._img[e.dataset.img]) { e.src = this._img[e.dataset.img]; e.onclick = () => this.lightbox(e.src); } });
  },
  lightbox(src) {
    const o = document.createElement("div");
    o.className = "lightbox"; o.innerHTML = '<img alt="photo" src="' + this.esc(src) + '"><button class="navbtn" aria-label="Close">✕</button>';
    o.onclick = () => o.remove();
    document.body.appendChild(o);
  },
  shrink(file, max) {
    return new Promise((ok, bad) => {
      const rd = new FileReader(), img = new Image();
      rd.onload = () => {
        img.onload = () => {
          const k = Math.min(1, (max || 1280) / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(b => b ? ok(b) : bad(new Error("That file is not a photo.")), "image/jpeg", 0.78);
        };
        img.onerror = () => bad(new Error("That file is not a photo."));
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  },
  // a whole chat box; target = {section, service, reservation}
  EMOJI: ["👍", "❤️", "😂", "✅", "🙏"],
  reactsHTML(m) {
    const R = m.reacts || []; if (!R.length) return "";
    return '<div class="reacts">' + this.EMOJI.filter(e => R.some(x => x.e === e)).map(e => { const L = R.filter(x => x.e === e), on = L.some(x => x.p === this.user.id);
      return '<button type="button" class="rc' + (on ? " on" : "") + '" data-react="' + m.id + "|" + e + '" title="' + this.esc(L.map(x => x.n || "").join("، ")) + '">' + e + " " + L.length + "</button>"; }).join("") + "</div>";
  },
  // ✓ sent · ✓✓ delivered · ✓✓ (gold) seen; tap to see who
  ticksHTML(m) {
    const R = m.reads || [], seen = R.filter(x => x.s).length;
    const cls = seen ? "seen" : R.length ? "dlv" : "";
    return '<button type="button" class="ticks ' + cls + '" data-rcpt="' + m.id + '" title="' + this.esc(seen ? (this.tr ? this.tr("Seen") : "Seen") + " " + seen : R.length ? (this.tr ? this.tr("Delivered") : "Delivered") + " " + R.length : (this.tr ? this.tr("Sent") : "Sent")) + '">' + (R.length ? "✓✓" : "✓") + (seen ? "<small>" + seen + "</small>" : "") + "</button>";
  },
  rcptHTML(m) {
    const t = x => this.esc(this.tr ? this.tr(x) : x), f = d => this.esc(new Date(d).toLocaleString(this.loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
    const R = m.reads || [], S = R.filter(x => x.s), D = R.filter(x => !x.s);
    return '<div class="rcpt">' + (S.length ? "<b>✓✓ " + t("Seen by") + "</b>" + S.map(x => "<div><span>" + this.esc(x.n || "") + "</span><small>" + f(x.s) + "</small></div>").join("") : "") +
      (D.length ? "<b>✓✓ " + t("Delivered to") + "</b>" + D.map(x => "<div><span>" + this.esc(x.n || "") + "</span><small>" + f(x.d) + "</small></div>").join("") : "") +
      (!R.length ? "<b>✓ " + t("Sent. Nobody has opened the site since.") + "</b>" : "") + "</div>";
  },
  pinsHTML(msgs) {
    const P = msgs.filter(m => m.pinned_at && !m.deleted_at).sort((a, b) => a.pinned_at < b.pinned_at ? 1 : -1);
    if (!P.length) return "";
    const t = x => this.tr ? this.tr(x) : x;
    return '<div class="chat-pins"><b>📌 ' + this.esc(t("Pinned")) + " (" + P.length + ")</b>" + P.map(m => '<button type="button" class="pinrow" data-jump="' + m.id + '"><span dir="auto">' +
      this.esc((m.body || "📷").slice(0, 110)) + "</span><small>" + this.esc((m.sender_name || "") + " · " + this.fmtDate(m.created_at)) + "</small></button>").join("") + "</div>";
  },
  chatHTML(id, msgs, small) {
    return '<div class="chat' + (small ? " small" : "") + '" id="' + id + '">' + this.pinsHTML(msgs) + '<div class="chat-list">' + this.bubbles(msgs) + '</div><div class="chat-prev" hidden></div><div class="chat-reply" hidden></div>' +
      '<form class="chat-form"><label class="btn line chat-cam" title="Add photos">📷<input type="file" accept="image/*" multiple hidden></label><textarea rows="1" placeholder="Write a message…" dir="auto"></textarea><button class="btn gold" type="submit">Send</button></form></div>';
  },
  bindChat(id, target, reload, msgs) {
    const box = document.getElementById(id); if (!box) return;
    let replyTo = null;
    const rbar = box.querySelector(".chat-reply");
    const all = msgs || this._lastMsgs || [];
    const list = box.querySelector(".chat-list"), ta = box.querySelector("textarea"), fileIn = box.querySelector('input[type="file"]'), prev = box.querySelector(".chat-prev");
    let files = [];
    const showPrev = () => {
      prev.hidden = !files.length;
      prev.innerHTML = files.map((f, i) => '<span><img alt="" src="' + URL.createObjectURL(f) + '"><button type="button" data-rmf="' + i + '" aria-label="Remove">✕</button></span>').join("");
      prev.querySelectorAll("[data-rmf]").forEach(b => b.onclick = () => { files.splice(Number(b.dataset.rmf), 1); showPrev(); });
    };
    fileIn.onchange = () => {
      const add = [...fileIn.files].filter(f => /^image\//.test(f.type));
      if (files.length + add.length > 4) this.toast(this.tr ? this.tr("Up to 4 photos per message.") : "Up to 4 photos per message.", "err");
      files = files.concat(add).slice(0, 4); fileIn.value = ""; showPrev();
    };
    list.scrollTop = list.scrollHeight;
    this.fillImages(list).then(() => { list.scrollTop = list.scrollHeight; });
    list.querySelectorAll("img[data-img]").forEach(im => im.addEventListener("load", () => { if (list.scrollHeight - list.scrollTop - list.clientHeight < 400) list.scrollTop = list.scrollHeight; }));
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !/Mobi/i.test(navigator.userAgent)) { e.preventDefault(); box.querySelector("form").requestSubmit(); } };
    box.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body && !files.length) return;
      const btn = box.querySelector("button[type=submit]"); btn.disabled = true;
      const folder = target.reservation ? "r" + target.reservation : target.section ? "s" + target.section : "v" + target.service;
      const paths = [];
      try {
        for (const f of files) {
          const blob = await this.shrink(f, 1280);
          const path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
          const up = await supabaseClient.storage.from("chat").upload(path, blob, { contentType: "image/jpeg" });
          if (up.error) throw up.error;
          paths.push(path);
        }
      } catch (err) { btn.disabled = false; return this.toast(this.errText(err), "err"); }
      const { error } = await supabaseClient.rpc("send_message", { p_section: target.section || null, p_service: target.service || null, p_reservation: target.reservation || null, p_body: body, p_images: paths, p_reply_to: replyTo });
      btn.disabled = false;
      if (error) { if (paths.length) supabaseClient.storage.from("chat").remove(paths); return this.toast(this.errText(error), "err"); }
      ta.value = ""; ta.style.height = "auto"; files = []; showPrev(); replyTo = null; rbar.hidden = true;
      reload();
    };
    box.querySelectorAll("[data-mrep]").forEach(b => b.onclick = () => {
      const el = document.getElementById("msg" + b.dataset.mrep);
      replyTo = Number(b.dataset.mrep);
      const who = el.querySelector(".bub-who").textContent.replace(/WAREHOUSE|المخزن|ENTREPÔT/, "").trim();
      const txt = (el.querySelector(".bub-txt") || {}).textContent || "📷";
      rbar.innerHTML = '<span>↩ <b>' + this.esc(who) + "</b>: " + this.esc(txt.slice(0, 90)) + '</span><button type="button" class="linkbtn" aria-label="Cancel">✕</button>';
      rbar.hidden = false; rbar.querySelector("button").onclick = () => { replyTo = null; rbar.hidden = true; };
      ta.focus();
    });
    box.querySelectorAll("[data-jump]").forEach(q => q.onclick = () => { const el = document.getElementById("msg" + q.dataset.jump); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1200); } });
    // reactions
    const react = async (id, e) => {
      const m = (this._msgx || {})[id], mine = m && (m.reacts || []).some(x => x.p === this.user.id && x.e === e);
      const r = mine ? await supabaseClient.from("message_reactions").delete().eq("message_id", id).eq("profile_id", this.user.id).eq("emoji", e)
                     : await supabaseClient.from("message_reactions").insert({ message_id: id, emoji: e });
      if (r.error) return this.toast(this.errText(r.error), "err");
      reload();
    };
    box.querySelectorAll("[data-react]").forEach(b => b.onclick = () => { const [id, e] = b.dataset.react.split("|"); react(Number(id), e); });
    box.querySelectorAll("[data-mreact]").forEach(b => b.onclick = () => {
      const bub = b.closest(".bub"), old = bub.querySelector(".rpick"); if (old) { old.remove(); return; }
      box.querySelectorAll(".rpick").forEach(x => x.remove());
      const d = document.createElement("div"); d.className = "rpick";
      d.innerHTML = this.EMOJI.map(e => '<button type="button" data-e="' + e + '">' + e + "</button>").join("");
      bub.appendChild(d); d.querySelectorAll("[data-e]").forEach(x => x.onclick = () => react(Number(b.dataset.mreact), x.dataset.e));
    });
    box.querySelectorAll("[data-rcpt]").forEach(b => b.onclick = () => {
      const bub = b.closest(".bub"), old = bub.querySelector(".rcpt"); if (old) { old.remove(); return; }
      const m = (this._msgx || {})[Number(b.dataset.rcpt)]; if (!m) return;
      bub.insertAdjacentHTML("beforeend", this.rcptHTML(m));
    });
    // seen: the messages on this screen that others sent
    this._seen = this._seen || {};
    const unseen = [...box.querySelectorAll(".bub[id^=msg]:not(.mine):not(.deleted)")].map(x => Number(x.id.slice(3))).filter(id => {
      const m = (this._msgx || {})[id]; return !this._seen[id] && !(m && (m.reads || []).some(r => r.p === this.user.id && r.s)); });
    if (unseen.length && document.visibilityState === "visible") { unseen.forEach(id => { this._seen[id] = 1; }); supabaseClient.rpc("mark_seen", { p_ids: unseen }).then(() => {}); }
    box.querySelectorAll("[data-mpin]").forEach(b => b.onclick = async () => {
      const on = b.dataset.on === "1";
      if (!on && !confirm(this.tr ? this.tr("Remove this pin?") : "Remove this pin?")) return;
      const { error } = await supabaseClient.rpc("pin_message", { p_id: Number(b.dataset.mpin), p_pin: on });
      if (error) return this.toast(this.errText(error), "err");
      this.toast(on ? "Pinned 📌" : "Pin removed");
      reload();
    });
    box.querySelectorAll("[data-medit]").forEach(b => b.onclick = async () => {
      const el = document.getElementById("msg" + b.dataset.medit), cur = (el.querySelector(".bub-txt") || {}).textContent || "";
      const v = prompt(this.tr ? this.tr("Edit your message:") : "Edit your message:", cur);
      if (v === null || !v.trim() || v.trim() === cur) return;
      const { error } = await supabaseClient.rpc("edit_message", { p_id: Number(b.dataset.medit), p_body: v });
      if (error) return this.toast(this.errText(error), "err");
      reload();
    });
    box.querySelectorAll("[data-mdel]").forEach(b => b.onclick = async () => {
      if (!confirm("Delete this message?")) return;
      const { data, error } = await supabaseClient.rpc("delete_message", { p_id: Number(b.dataset.mdel) });
      if (error) return this.toast(this.errText(error), "err");
      if (data && data.length) supabaseClient.storage.from("chat").remove(data);
      reload();
    });
  },
  // =================== edit mode (warehouse team): texts, hidden things, order ===================
  ui: (function () { try { return JSON.parse(localStorage.getItem("basUI") || "{}"); } catch (e) { return {}; } })(),
  page() { return (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index"; },
  editMode() { try { return this.isAdmin() && sessionStorage.getItem("basEdit") === "1"; } catch (e) { return false; } },
  async loadUI() {
    const r = await supabaseClient.from("site_ui").select("key, value");
    if (r.error) return;
    const u = {}; (r.data || []).forEach(x => { u[x.key] = x.value; });
    const js = JSON.stringify(u);
    if (js !== JSON.stringify(this.ui)) { this.ui = u; try { localStorage.setItem("basUI", js); } catch (e) {} if (this.retr) this.retr(); }
    this.applyUI();
  },
  async saveUI(key, val) {
    this.ui[key] = val;
    try { localStorage.setItem("basUI", JSON.stringify(this.ui)); } catch (e) {}
    const { error } = await supabaseClient.rpc("save_ui", { p_key: key, p_value: val });
    if (error) { this.toast(this.errText(error), "err"); return false; }
    return true;
  },
  // the English text a node was written with (before translation)
  srcText(el) {
    let out = "";
    el.childNodes.forEach(n => { if (n.nodeType === 3) out += (n.__o != null && n.nodeValue === n.__t ? n.__o : n.nodeValue); else if (n.nodeType === 1 && !/^(svg|img|input|select|textarea|button)$/i.test(n.tagName)) out += this.srcText(n); });
    return out.replace(/\s+/g, " ").trim();
  },
  hideKey(el) {
    if (el.dataset && el.dataset.mk) return { p: "*", k: "mk:" + el.dataset.mk };
    if (el.id && !/^(view|sheet|main|top|drawer)$/.test(el.id)) return { p: this.page(), k: "id:" + el.id };
    const t = this.srcText(el);
    return t ? { p: this.page(), k: "tx:" + el.tagName.toLowerCase() + ":" + t } : null;
  },
  HIDE_SEL: "a, button, label, .kpi, .tab, h3, .panel, .person, .group-title, details",
  applyUI() {
    const H = (this.ui.hide || []).filter(h => h.p === "*" || h.p === this.page());
    const sel = [];
    H.forEach(h => {
      if (h.k.startsWith("mk:")) sel.push('[data-mk="' + h.k.slice(3).replace(/"/g, "") + '"]');
      else if (h.k.startsWith("id:")) sel.push("#" + CSS.escape(h.k.slice(3)));
    });
    const css = sel.map(x => "body:not(.ui-edit) " + x + "{display:none!important} body.ui-edit " + x + "{opacity:.35;outline:2px dashed var(--bad)}").join("\n");
    let st = document.getElementById("uiCss");
    if (!st) { st = document.createElement("style"); st.id = "uiCss"; document.head.appendChild(st); }
    st.textContent = css;
    const TX = H.filter(h => h.k.startsWith("tx:"));
    document.querySelectorAll(".ui-hid").forEach(e => e.classList.remove("ui-hid"));
    if (TX.length) document.querySelectorAll(this.HIDE_SEL).forEach(e => { const k = this.hideKey(e); if (k && TX.some(h => h.k === k.k)) e.classList.add("ui-hid"); });
    document.body.classList.toggle("ui-edit", this.editMode());
    this.applyOrder(document.body);
  },
  contKey(c) {
    if (c.classList.contains("dr-g")) { const h = c.querySelector("h5"); return "*|menu:" + (h ? this.srcText(h) : "top"); }
    const ch = c.firstElementChild, a = ch && [...ch.attributes].find(x => /^data-/.test(x.name));
    return this.page() + "|" + (c.id || "tabs:" + (a ? a.name : "x"));
  },
  childKey(e) { const a = [...e.attributes].find(x => /^data-/.test(x.name) && !/^data-(k|mk-n)$/.test(x.name)); return a ? a.name + "=" + a.value : "t:" + this.srcText(e); },
  applyOrder(root) {
    const O = this.ui.order || {};
    if (!Object.keys(O).length || !root.querySelectorAll) return;
    root.querySelectorAll(".tabs, .dr-g").forEach(c => {
      const want = O[this.contKey(c)]; if (!want) return;
      const kids = [...c.children].filter(e => e.tagName !== "H5");
      const pos = e => { const i = want.indexOf(this.childKey(e)); return i < 0 ? 999 : i; };
      const sorted = kids.slice().sort((a, b) => pos(a) - pos(b));
      if (sorted.some((e, i) => e !== kids[i])) sorted.forEach(e => c.appendChild(e));
    });
  },
  // the bar at the bottom while editing
  TOOL: "rename",
  editBar() {
    let b = document.getElementById("uiBar");
    if (!this.editMode()) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("div"); b.id = "uiBar"; b.className = "ui-bar"; document.body.appendChild(b); }
    const t = x => this.esc(this.tr ? this.tr(x) : x);
    b.innerHTML = "<b>✏️ " + t("Edit mode") + "</b>" + [["use", "👆 Use the page"], ["rename", "✏️ Rename"], ["hide", "👁 Hide / show"], ["order", "↕ Move"]].map(x => '<button class="tab' + (this.TOOL === x[0] ? " on" : "") + '" data-tool="' + x[0] + '">' + t(x[1]) + "</button>").join("") +
      '<button class="btn line sm" id="uiReset">' + t("Reset this page") + '</button><button class="btn gold sm" id="uiDone">' + t("Done") + "</button>";
    b.querySelectorAll("[data-tool]").forEach(x => x.onclick = () => { this.TOOL = x.dataset.tool; this.editBar(); });
    b.querySelector("#uiDone").onclick = () => { try { sessionStorage.removeItem("basEdit"); } catch (e) {} location.reload(); };
    b.querySelector("#uiReset").onclick = () => this.resetPage();
  },
  async resetPage() {
    if (!confirm("Reset this page? Renamed texts on it go back to normal, hidden things come back and the order returns to normal.")) return;
    const pg = this.page();
    const onPage = new Set(); document.querySelectorAll("body *").forEach(e => { if (!e.closest("#uiBar")) e.childNodes.forEach(n => { if (n.nodeType === 3 && n.__o) onPage.add(n.__o.trim()); else if (n.nodeType === 3) onPage.add(n.nodeValue.trim()); }); });
    const text = Object.assign({}, this.ui.text || {}); Object.keys(text).forEach(k => { if (onPage.has(k)) delete text[k]; });
    const hide = (this.ui.hide || []).filter(h => h.p !== pg);
    const order = Object.assign({}, this.ui.order || {}); Object.keys(order).forEach(k => { if (k.split("|")[0] === pg) delete order[k]; });
    await this.saveUI("text", text); await this.saveUI("hide", hide); await this.saveUI("order", order);
    location.reload();
  },
  editClick(e) {
    if (!this.editMode() || e.target.closest("#uiBar, .ui-dlg, .ui-ord")) return;
    if (e.target.closest("[data-uiok]") || this.TOOL === "use") return;   // the page's own editors, or just using the page
    e.preventDefault(); e.stopPropagation();
    if (this.TOOL === "hide") {
      const el = e.target.closest("[data-mk]") || e.target.closest(this.HIDE_SEL); if (!el) return;
      const k = this.hideKey(el); if (!k) return;
      const L = (this.ui.hide || []).slice(), i = L.findIndex(h => h.k === k.k && h.p === k.p);
      if (i >= 0) L.splice(i, 1); else L.push(k);
      this.saveUI("hide", L).then(() => this.applyUI());
      return;
    }
    if (this.TOOL === "order") {
      const c = e.target.closest(".tabs, .dr-g"); if (!c) { this.toast("Only tabs and menu items can be moved.", "err"); return; }
      const el = [...c.children].find(x => x.contains(e.target) && x.tagName !== "H5"); if (!el) return;
      this.orderPop(c, el);
      return;
    }
    // rename: the smallest element with its own text
    let el = e.target;
    while (el && el !== document.body && ![...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) el = el.parentElement;
    if (!el || el === document.body) return;
    const n = [...el.childNodes].find(x => x.nodeType === 3 && x.nodeValue.trim());
    const key = (n.__o != null && n.nodeValue === n.__t ? n.__o : n.nodeValue).trim();
    if (!/[A-Za-z]/.test(key)) { this.toast("This text comes from the data, not the website. Change it where it's saved.", "err"); return; }
    this.renameDlg(key);
  },
  renameDlg(key) {
    const cur = (this.ui.text || {})[key] || {}, t = x => this.esc(this.tr ? this.tr(x) : x);
    const d = document.createElement("div"); d.className = "overlay ui-dlg";
    d.innerHTML = '<div class="sheet" style="max-width:460px"><h2>✏️ ' + t("Rename") + '</h2><p class="meta" dir="ltr">' + this.esc(key) + "</p>" +
      '<div class="field"><label>English</label><input id="uiEn" dir="ltr" value="' + this.esc(cur.en || "") + '" placeholder="' + this.esc(key) + '"></div>' +
      '<div class="field"><label>العربي</label><input id="uiAr" dir="rtl" value="' + this.esc(cur.ar || "") + '"></div>' +
      '<div class="field"><label>Français</label><input id="uiFr" dir="ltr" value="' + this.esc(cur.fr || "") + '"></div>' +
      '<p class="meta">' + t("Leave a box empty to keep the normal text in that language. This changes the text everywhere it appears.") + "</p>" +
      '<div class="actions"><button class="btn gold" id="uiGo">' + t("Save") + '</button><button class="btn line" id="uiBk">' + t("Back") + "</button></div></div>";
    document.body.appendChild(d);
    d.querySelector("#uiBk").onclick = () => d.remove();
    d.querySelector("#uiGo").onclick = async () => {
      const v = { en: d.querySelector("#uiEn").value.trim(), ar: d.querySelector("#uiAr").value.trim(), fr: d.querySelector("#uiFr").value.trim() };
      Object.keys(v).forEach(k => { if (!v[k]) delete v[k]; });
      const text = Object.assign({}, this.ui.text || {});
      if (Object.keys(v).length) text[key] = v; else delete text[key];
      if (await this.saveUI("text", text)) { d.remove(); if (this.retr) this.retr(); this.toast("Saved"); }
    };
  },
  orderPop(c, el) {
    document.querySelectorAll(".ui-ord").forEach(x => x.remove());
    const pop = document.createElement("div"); pop.className = "ui-ord";
    pop.innerHTML = '<button data-mv="-1">↑ ←</button><button data-mv="1">↓ →</button><button data-mv="0">✕</button>';
    const r = el.getBoundingClientRect(); pop.style.top = (window.scrollY + r.bottom + 4) + "px"; pop.style.left = (window.scrollX + r.left) + "px";
    document.body.appendChild(pop);
    pop.querySelectorAll("[data-mv]").forEach(b => b.onclick = async () => {
      const mv = Number(b.dataset.mv); if (!mv) { pop.remove(); return; }
      const kids = [...c.children].filter(e => e.tagName !== "H5"), i = kids.indexOf(el), j = i + mv;
      if (j < 0 || j >= kids.length) return;
      if (mv < 0) c.insertBefore(el, kids[j]); else c.insertBefore(el, kids[j].nextSibling);
      const order = Object.assign({}, this.ui.order || {}); order[this.contKey(c)] = [...c.children].filter(e => e.tagName !== "H5").map(e => this.childKey(e));
      await this.saveUI("order", order);
      const r2 = el.getBoundingClientRect(); pop.style.top = (window.scrollY + r2.bottom + 4) + "px"; pop.style.left = (window.scrollX + r2.left) + "px";
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

// edit mode: watch the page for new content (hidden things, order) and catch taps while editing
(function () {
  if (typeof document === "undefined") return;
  document.addEventListener("click", e => BAS.editClick(e), true);
  let q = false;
  new MutationObserver(() => {
    if (q) return; q = true;
    requestAnimationFrame(() => { q = false; const H = (BAS.ui.hide || []).some(h => h.k.startsWith("tx:")); if (H) BAS.applyUI(); else BAS.applyOrder(document.body); if (BAS.editMode() && !document.getElementById("uiBar")) BAS.editBar(); });
  }).observe(document.body, { childList: true, subtree: true });
})();

// ---------- attendance that doesn't get lost ----------
// draft: marks kept on this phone as they're tapped (survives a reload). offq: saves that waited for internet.
BAS.draft = {
  get(k) { try { const v = localStorage.getItem("bas-d-" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("bas-d-" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("bas-d-" + k); } catch (e) {} },
};
BAS.isNetErr = e => (typeof navigator !== "undefined" && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(String((e && (e.message || e.details)) || e || ""));
BAS.offq = {
  list() { try { return JSON.parse(localStorage.getItem("bas-offq") || "[]"); } catch (e) { return []; } },
  put(L) { try { localStorage.setItem("bas-offq", JSON.stringify(L)); } catch (e) {} BAS.offqBadge(); },
  // key: one entry per meeting (a newer save replaces an older one)
  push(key, rpc, args, label) { const L = this.list().filter(x => x.key !== key); L.push({ key, rpc, args, label, at: Date.now() }); this.put(L); },
  async flush() {
    const L = this.list(); if (!L.length || this.busy || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    this.busy = true; let sent = 0; const keep = [];
    for (const x of L) {
      const { error } = await supabaseClient.rpc(x.rpc, x.args);
      if (!error) { sent++; if (x.draft) BAS.draft.del(x.draft); }
      else if (BAS.isNetErr(error)) keep.push(x);
      else { keep.push(Object.assign(x, { err: BAS.errText(error) })); }
    }
    this.busy = false; this.put(keep);
    if (sent) { BAS.toast("✅ " + sent + " " + BAS.tr("saved now that there's internet")); if (BAS.onOffqSent) BAS.onOffqSent(); }
  },
};
BAS.offqBadge = () => {
  if (typeof document === "undefined") return;
  const L = BAS.offq.list(); let b = document.getElementById("offqB");
  if (!L.length) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "offqB"; b.className = "offq"; document.body.appendChild(b); b.onclick = () => BAS.offq.flush(); }
  const bad = L.filter(x => x.err);
  b.textContent = bad.length ? "⚠️ " + BAS.tr("Couldn't save") + ": " + bad.map(x => x.label + " (" + x.err + ")").join(" · ")
    : "⏳ " + L.length + " " + BAS.tr("waiting for internet. It sends by itself.");
};
if (typeof window !== "undefined") {
  window.addEventListener("online", () => BAS.offq.flush());
  window.addEventListener("load", () => { BAS.offqBadge(); setTimeout(() => BAS.offq.flush(), 1500); });
  setInterval(() => BAS.offq.flush(), 30000);
}

// a kad with missing details sees a small card at the top of the page (not a pop-up); "Later" hides it for 3 days
BAS.detailsNudge = async function () {
  try {
    if (!this.profile || !this.profile.section_id || this.isAdmin()) return;
    const until = Number(localStorage.getItem("bas-dn-later") || 0); if (until > Date.now()) return;
    const { data, error } = await supabaseClient.rpc("my_details");
    if (error || !data || !data.missing || !data.missing.length) return;
    const main = document.querySelector("main"); if (!main || document.getElementById("dnCard")) return;
    const head = main.querySelector(".head");
    const c = document.createElement("div"); c.id = "dnCard"; c.className = "msg info";
    c.innerHTML = "📝 <b>" + BAS.esc(BAS.tr("Complete your details")) + "</b> (" + data.missing.length + " " + BAS.esc(BAS.tr("missing")) + ") " +
      '<a class="btn gold sm" href="profile.html#details">' + BAS.esc(BAS.tr("Fill them now")) + '</a> <button class="linkbtn" id="dnLater">' + BAS.esc(BAS.tr("Later")) + "</button>";
    if (head) head.after(c); else main.prepend(c);
    document.getElementById("dnLater").onclick = () => { try { localStorage.setItem("bas-dn-later", String(Date.now() + 3 * 864e5)); } catch (e) {} c.remove(); };
  } catch (e) {}
};

// ---------- phones: 11 numbers ----------
// every phone box: Arabic numbers become English, anything that isn't a number goes, at most 11
BAS.normPhone = v => { let d = String(v || "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[^0-9]/g, "");
  if (/^0020/.test(d)) d = "0" + d.slice(4); else if (/^20\d{10}$/.test(d)) d = "0" + d.slice(2); return d; };
if (typeof document !== "undefined") {
  document.addEventListener("input", e => {
    const el = e.target; if (!el || el.tagName !== "INPUT" || el.type !== "tel") return;
    // +20 / 0020 at the start: let them finish typing, then it becomes 0…
    const raw = String(el.value).replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[^0-9]/g, ""), d = BAS.normPhone(el.value).slice(0, /^(00|2)/.test(raw) && raw.length < 12 ? 14 : 11);
    if (d !== el.value) el.value = d;
    el.classList.toggle("bad", d.length > 0 && d.length < 11);
  }, true);
  document.addEventListener("focusin", e => { const el = e.target; if (el && el.tagName === "INPUT" && el.type === "tel") { el.removeAttribute("maxlength"); el.inputMode = "numeric"; } }, true);
}

// ---------- أب الاعتراف: the church's list, or write it ----------
BAS.fathers = () => (BAS.settings && BAS.settings.confession_fathers) || ["Fr. Athanasious", "Fr. Elia Naguib", "Fr. Augustinos", "Fr. Michael Youssef", "Fr. Mina Zaher", "Fr. Raphael"];
BAS.fatherField = (id, v) => {
  const L = BAS.fathers(), other = !!v && L.indexOf(v) < 0;
  return '<select id="' + id + 'S" data-father="' + id + '"><option value="">—</option>' + L.map(n => '<option' + (n === v ? " selected" : "") + ">" + BAS.esc(n) + "</option>").join("") +
    '<option value="__o"' + (other ? " selected" : "") + ">" + BAS.esc(BAS.tr("Someone else (write it)")) + "</option></select>" +
    '<input id="' + id + '" dir="auto" placeholder="' + BAS.esc(BAS.tr("Write the name")) + '" value="' + BAS.esc(v || "") + '"' + (other ? "" : " hidden") + ' style="margin-top:6px">';
};
if (typeof document !== "undefined") document.addEventListener("change", e => {
  const sel = e.target; if (!sel || !sel.dataset || !sel.dataset.father) return;
  const inp = document.getElementById(sel.dataset.father); if (!inp) return;
  if (sel.value === "__o") { inp.hidden = false; inp.value = ""; inp.focus(); } else { inp.hidden = true; inp.value = sel.value; }
}, true);

// ---------- notifications: each person chooses ----------
BAS.NOTIF = [["requests", "📦 Their stage's requests (ready, return date, late)"], ["meetings", "📅 Kada meetings, تحضير and meeting plans"], ["scouts", "🧒 Scouts (birthdays, absences, 3arif)"],
  ["news", "📣 Announcements"], ["messages", "💬 Messages"], ["team", "🧰 Warehouse work (new requests, accounts, stock)", true], ["activity", "📝 Everything people do on the site (it's all in Team › Log)", true]];
// p: the profile; off: its notif_off; admin: show the warehouse kinds
BAS.notifBoxes = (off, admin) => BAS.NOTIF.filter(n => !n[2] || admin).map(n => '<label class="pick" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-nf="' + n[0] + '"' + ((off || ["activity"]).indexOf(n[0]) < 0 ? " checked" : "") + "> " + BAS.esc(BAS.tr(n[1])) + "</label>").join("");
BAS.notifRead = el => BAS.NOTIF.map(n => n[0]).filter(k => { const c = el.querySelector('[data-nf="' + k + '"]'); return c ? !c.checked : k === "activity"; });

// ---------- delete forever: fingerprint / Face ID on this phone, or the code ----------
// The code stops mistakes. After the code works once on a phone, it can be kept behind the phone's fingerprint.
BAS.askCode = async function (msg) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem("bas-fp") || "null"); } catch (e) { return null; } })();
  if (saved && window.PublicKeyCredential && navigator.credentials) {
    try {
      const ch = crypto.getRandomValues(new Uint8Array(32)), id = Uint8Array.from(atob(saved.cred), c => c.charCodeAt(0));
      await navigator.credentials.get({ publicKey: { challenge: ch, allowCredentials: [{ type: "public-key", id }], userVerification: "required", timeout: 60000 } });
      return saved.code;
    } catch (e) { /* cancelled or not available: fall back to the code */ }
  }
  const code = prompt(msg + "\n\n" + BAS.tr("Type the code to confirm."));
  if (code) BAS._lastCode = code.trim();
  return code;
};
// call after the server accepted the code: offer the fingerprint for next time
BAS.codeWorked = async function () {
  const code = BAS._lastCode; BAS._lastCode = null;
  if (!code || !window.PublicKeyCredential || !navigator.credentials) return;
  try { if (localStorage.getItem("bas-fp")) return; } catch (e) { return; }
  try { if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return; } catch (e) { return; }
  if (!confirm(BAS.tr("Use your fingerprint / Face ID on this phone next time instead of typing the code?"))) return;
  try {
    const c = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "BAS" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: (this.profile && this.profile.full_name) || "BAS", displayName: (this.profile && this.profile.full_name) || "BAS" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, timeout: 60000 } });
    localStorage.setItem("bas-fp", JSON.stringify({ cred: btoa(String.fromCharCode(...new Uint8Array(c.rawId))), code }));
    this.toast("👆 " + this.tr("Done. Next time it asks for your fingerprint."));
  } catch (e) {}
};

// ---------- Registration details: the form sent to the parents' groups (filled in Group records by the warehouse team) ----------
(function () {
const REG = [
  ["h", "The scout"], ["name_ar", "Arabic name"], ["phone", "Scout's phone (if they have one)", "tel"], ["school", "School"], ["school_year", "School year", "year"], ["birthday", "Birthday", "date"], ["national_id", "National ID", "nid"], ["job", "Their work (if they work)"],
  ["h", "Father"], ["father_name", "Father's full name"], ["father_job", "Father's job"], ["father_phone", "Father's phone", "tel"], ["father_call_ok", "OK to call the father? (busy most of the time → No)", "yn"], ["father_national_id", "Father's national ID", "nid"],
  ["h", "Mother"], ["mother_name", "Mother's full name"], ["mother_job", "Mother's job (if she works)"], ["mother_phone", "Mother's phone", "tel"], ["mother_national_id", "Mother's national ID", "nid"],
  ["h", "Other"], ["joined_on", "Joined the scouts on (if known)", "date"], ["notes", "Notes on dealing with the scout", "area"], ["confession_father", "Confession father", "father"],
  ["h", "Papers"], ["photo_path", "A recent face photo (4×6, white background is fine)", "file"], ["birth_cert_path", "Birth certificate", "file"], ["id_front_path", "ID card: front", "file"], ["id_back_path", "ID card: back", "file"]];
function shrinkTo(file, max) {
  return new Promise((ok, bad) => {
    const rd = new FileReader(), img = new Image();
    rd.onload = () => { img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? ok(b) : bad(new Error("That file is not a photo.")), "image/jpeg", 0.85);
    }; img.onerror = () => bad(new Error("That file is not a photo.")); img.src = rd.result; };
    rd.readAsDataURL(file);
  });
}
const AR_D = t => String(t || "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
const AR_N = t => AR_D(t).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const PP_LABELS = [   // checked in this order, so "الرقم القومي للأب" wins over "الرقم القومي"
  ["father_national_id", /^الرقم القومي للاب/], ["mother_national_id", /^الرقم القومي للام/], ["national_id", /^الرقم القومي/],
  ["father_name", /^اسم الاب/], ["mother_name", /^اسم الام/], ["names", /^اسم الكشاف/],
  ["father_job", /^مهنه الاب/], ["mother_job", /^مهنه الام/], ["father_phone", /^رقم الاب/], ["mother_phone", /^رقم الام/], ["phone", /^رقم الكشاف/],
  ["father_call_ok", /^\(?يحبذ الاتصال/], ["school", /^المدرسه/], ["school_year", /^السنه الدراسيه/], ["birthday", /^تاريخ الميلاد/],
  ["joined_on", /^تاريخ الالتحاق/], ["notes", /^ملاحظات/], ["confession_father", /^اب الاعتراف/], ["_end", /^برجاء ارسال|^صوره حديثه/]];
const AR_MON = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"];
function ppDate(v) {
  const t = AR_N(v).toLowerCase(); let m;
  if ((m = t.match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/))) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  if ((m = t.match(/(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{2,4})/))) { let y = m[3]; if (y.length === 2) y = (Number(y) > 40 ? "19" : "20") + y; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
  const mi = AR_MON.findIndex(x => t.includes(x));
  if (mi >= 0 && (m = t.match(/(\d{1,2})\D+(\d{4})/))) return m[2] + "-" + String(mi + 1).padStart(2, "0") + "-" + m[1].padStart(2, "0");
  if ((m = t.match(/^\s*(\d{4})\s*$/))) return "";
  return "";
}
function ppYear(v) {
  const t = AR_N(v).toLowerCase().replace(/\s+/g, " ");
  if (/kg ?1|كي جي ?1|حضانه ?1/.test(t)) return "KG1"; if (/kg ?2|كي جي ?2|حضانه ?2/.test(t)) return "KG2";
  if (/خريج|بيشتغل|يعمل/.test(t)) return "خريج / بيشتغل";
  const W = [[1, /\b1\b|اول|الاولي/], [2, /\b2\b|ثاني|تاني|الثانيه|تانيه/], [3, /\b3\b|ثالث|تالت|ثالثه|تالته/], [4, /\b4\b|رابع|رابعه/], [5, /\b5\b|خامس|خامسه/], [6, /\b6\b|سادس|سادسه|ساتت/]];
  const n = (W.find(w => w[1].test(t.replace(/(ابتدائي|اعدادي|ثانوي|جامعه|كليه)/g, " "))) || [])[0];
  if (!n) return "";
  if (/ابتدائ/.test(t)) return n + " ابتدائي"; if (/اعداد/.test(t)) return n <= 3 ? n + " إعدادي" : ""; if (/ثانو/.test(t)) return n <= 3 ? n + " ثانوي" : "";
  if (/جامع|كليه/.test(t)) return n <= 5 ? "جامعة " + n : "";
  return "";
}
const FR_AR = [["اثناسيوس", "Athanas"], ["ايليا", "Elia"], ["اغسطينوس", "Augustin"], ["ميخائيل", "Michael"], ["مينا", "Mina"], ["رافائيل", "Raphael"]];
function ppFather(v) {
  const t = AR_N(v), L = BAS.fathers();
  for (const [a, e] of FR_AR) if (t.includes(a) || new RegExp(e, "i").test(v)) { const hit = L.find(n => new RegExp(e, "i").test(n)); if (hit) return hit; }
  return String(v).trim();
}
// Arabic part / English part of "اسم الكشاف" (written in both)
const ppAr = v => (String(v).match(/[؀-ۿ][؀-ۿ\s]*[؀-ۿ]/g) || []).sort((a, b) => b.length - a.length)[0] || "";
const ppEn = v => (String(v).match(/[A-Za-z][A-Za-z\s.'-]*[A-Za-z]/g) || []).sort((a, b) => b.length - a.length)[0] || "";
function parseParents(text) {
  const raw = {}; let cur = null;
  for (let line of String(text || "").replace(/\*/g, "").split(/\r?\n/)) {
    const n = AR_N(line.trim()), lab = PP_LABELS.find(l => l[1].test(n));
    if (lab) {
      if (lab[0] === "_end") { cur = null; continue; }
      cur = lab[0]; raw[cur] = raw[cur] || [];
      const i = line.indexOf("/"); if (i >= 0 && lab[0] !== "father_call_ok") raw[cur].push(line.slice(i + 1));
      continue;
    }
    if (cur && line.trim()) raw[cur].push(line);
  }
  const out = {}, j = k => (raw[k] || []).join(" ").replace(/\s+/g, " ").trim();
  if (j("names")) { const a = ppAr(j("names")).trim(), e = ppEn(j("names")).trim(); if (a) out.name_ar = a; if (e) out.name = e; }
  ["father_name", "mother_name"].forEach(k => { const v = j(k); if (v) out[k] = (ppAr(v) || v).trim(); });
  ["school", "father_job", "mother_job", "notes"].forEach(k => { const v = j(k); if (v && !/^(لا|لا يوجد|لايوجد|-|—|no|none)$/i.test(AR_N(v))) out[k] = v; });
  ["national_id", "father_national_id", "mother_national_id"].forEach(k => { const v = AR_D(j(k)).replace(/\D/g, ""); if (v) out[k] = v; });
  ["phone", "father_phone", "mother_phone"].forEach(k => { const v = BAS.normPhone(j(k)); if (v.length === 11) out[k] = v; });
  ["birthday", "joined_on"].forEach(k => { const v = ppDate(j(k)); if (v) out[k] = v; });
  if (out.mother_job) out.mother_works = "true";
  const y = ppYear(j("school_year")); if (y) out.school_year = y;
  const c = AR_N(j("father_call_ok")).toLowerCase();
  if (/^(نعم|اه|ايوه|ايوا|yes|ok|ممكن)/.test(c)) out.father_call_ok = "true"; else if (/^(لا|لأ|no|مش)/.test(c)) out.father_call_ok = "false";
  const cf = j("confession_father"); if (cf && !/^(لا|لا يوجد|-)$/.test(AR_N(cf))) out.confession_father = ppFather(cf);
  return out;
}
BAS.REG = REG; BAS.shrinkTo = shrinkTo; BAS.parseParents = parseParents;
})();
