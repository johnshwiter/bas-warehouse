// Kada attendance: a stage's kada meetings and تحضير (attendance.html › Kada) and group kada meetings (kada.html).
// The summary counts every kind: scout meetings, kada meetings, تحضير and group kada meetings.
"use strict";
window.KADAV = (function () {
  const esc = s => BAS.esc(s), T = x => (BAS.tr ? BAS.tr(x) : x);
  const KIND = { kada: ["👥", "Kada meeting"], prep: ["📝", "تحضير"], group: ["🏛", "Group kada meeting"] };
  const ST = [["present", "✓", "Present"], ["late", "⏰", "Late"], ["excused", "📝", "Excused"], ["absent", "✗", "Absent"]];
  const came = s => s === "present" || s === "late" || s === "half";
  const fmtT = t => { if (!t) return ""; let [h, m] = t.slice(0, 5).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; };
  const yearStart = () => (BAS.settings && BAS.settings.att_year_start) || "2000-01-01";

  // o: { el, sec (stage id, or null for group kada meetings), kada: [roster rows], sheet: overlay element }
  async function mount(o) {
    const S = { o, M: [], R: [], Y: [], cur: null, state: {}, editing: false, dirty: false };
    o.el.innerHTML = '<div class="empty">' + esc(T("Loading…")) + "</div>";
    async function load(pick) {
      try {
        let q = supabaseClient.from("kada_meetings").select("*").gte("meet_date", yearStart()).order("meet_date", { ascending: false });
        q = o.sec ? q.eq("section_id", o.sec) : q.is("section_id", null);
        S.M = await BAS.q(q);
        const ids = S.M.map(m => m.id);
        S.R = ids.length ? await BAS.q(supabaseClient.from("kada_att").select("*").in("meeting_id", ids)) : [];
        const y = await supabaseClient.rpc("kada_year_records", { p_section: o.sec || null });
        S.Y = y.error ? [] : y.data || [];
        const today = BAS.todayISO();
        S.cur = S.M.find(m => m.id === pick) || S.M.find(m => m.meet_date === today) || S.M.find(m => m.meet_date <= today && m.status !== "done") || S.M.find(m => m.meet_date <= today) || null;
        S.editing = false; S.dirty = false; fill(); draw();
      } catch (e) { o.el.innerHTML = '<div class="msg err">' + esc(BAS.errText(e)) + "</div>"; }
    }
    function fill() {
      S.state = {};
      if (!S.cur) return;
      const R = S.R.filter(r => r.meeting_id === S.cur.id);
      o.kada.forEach(p => { const r = R.find(x => x.roster_id === p.id); S.state[p.id] = r ? r.status : ""; });
    }
    const locked = () => S.cur && S.cur.status === "done" && !S.editing;
    const secName = id => BAS.sectionName ? BAS.sectionName(id) : "";
    function draw() {
      const today = BAS.todayISO();
      let h = '<div class="actions" style="margin:0 0 8px">' +
        (o.sec ? '<button class="btn line sm" data-add="kada">+ 👥 ' + esc(T("Kada meeting")) + '</button><button class="btn line sm" data-add="prep">+ 📝 ' + esc(T("تحضير")) + "</button>"
               : '<button class="btn line sm" data-add="group">+ 🏛 ' + esc(T("Group kada meeting")) + "</button>") +
        (S.cur && (BAS.isAdmin() || !S.R.some(r => r.meeting_id === S.cur.id)) ? '<button class="btn danger sm" id="kDel">' + esc(T("Delete this meeting")) + "</button>" : "") + "</div>";
      h += S.M.length ? '<div class="meets">' + S.M.slice().reverse().map(m => '<button class="meet ' + m.status + (S.cur && m.id === S.cur.id ? " on" : "") + '" data-km="' + m.id + '"><b>' + esc(BAS.fmtDate(m.meet_date, true)) + "</b>" +
          KIND[m.kind][0] + " " + esc(T(KIND[m.kind][1])) + " · " + (m.status === "done" ? "✅" : m.status === "draft" ? "📝" : m.meet_date > today ? "🕓" : "⬜") + (m.title ? " · " + esc(m.title) : "") + "</button>").join("") + "</div>"
        : '<div class="empty">' + esc(T(o.sec ? "No kada meetings or تحضير yet. Add one with the buttons above." : "No group kada meetings yet. Add one with the button above.")) + "</div>";
      if (S.cur) {
        const m = S.cur, fut = m.meet_date > today;
        h += '<div class="panel"><div class="req-top"><h3>' + KIND[m.kind][0] + " " + esc(T(KIND[m.kind][1])) + " · " + esc(BAS.fmtDate(m.meet_date, true)) + "<small>" + esc(m.start_time ? T("Starts") + " " + fmtT(m.start_time) : T("No start time")) + (m.title ? " · " + esc(m.title) : "") +
          '</small></h3><div><button class="linkbtn" id="kEdit">✏️ ' + esc(T("Time / title")) + "</button></div></div>" +
          '<div class="meta">' + (m.status === "done" ? "✅ " + esc(T("Taken by")) + " <bdi>" + esc(m.taken_by_name || "") + "</bdi>" + " · " + esc(BAS.fmtDateTime(m.taken_at)) : m.status === "draft" ? "📝 " + esc(T("Draft saved by")) + " <bdi>" + esc(m.taken_by_name || "") + "</bdi>" : esc(T("Not taken yet"))) + "</div></div>";
        if (fut) h += '<div class="empty">' + esc(T("This meeting hasn't happened yet.")) + "</div>";
        else if (!o.kada.length) h += '<div class="empty">' + esc(T("No kada in the list yet.")) + "</div>";
        else {
          const lk = locked() ? " disabled" : "";
          let last = null;
          h += (locked() ? "" : '<div class="actions" style="margin:0 0 8px"><button class="btn line sm" id="kAll">✓ ' + esc(T("Everyone present")) + "</button></div>") + '<div class="att-list">';
          o.kada.forEach(p => {
            if (!o.sec && p.section_id !== last) { last = p.section_id; h += '</div><div class="group-title">' + esc(secName(p.section_id)) + '</div><div class="att-list">'; }
            h += '<div class="att-row ' + (lk ? "locked " : "") + (S.state[p.id] || "unmarked") + '" data-kr="' + p.id + '"><div class="att-name" dir="auto">' + esc(p.name) + '</div><div class="att-ctl"><span class="seg">' +
              ST.map(s => '<button type="button" data-ks="' + s[0] + '" class="' + (S.state[p.id] === s[0] ? "on" : "") + '"' + lk + ">" + esc(T(s[0] === "present" ? "✓" : s[2])) + "</button>").join("") + "</span></div></div>";
          });
          h += "</div>";
          const n = Object.values(S.state).filter(came).length, set = Object.values(S.state).filter(Boolean).length;
          h += '<div class="att-sticky"><div class="meta">' + n + " " + esc(T("here")) + " · " + (o.kada.length - set) + " " + esc(T("not marked")) + '</div><div class="actions" style="margin:6px 0 0">' +
            (locked() ? '<span class="meta lockmsg">🔒 ' + esc(T("Finished. Press Edit to change it.")) + '</span><button class="btn line" id="kUnlock">✏️ ' + esc(T("Edit")) + "</button>"
              : m.status === "done" ? '<button class="btn gold" id="kSaveCh">💾 ' + esc(T("Save changes")) + '</button><button class="btn line" id="kCancel">' + esc(T("Cancel")) + "</button>"
              : '<button class="btn gold" id="kFin">✅ ' + esc(T("Finish")) + '</button><button class="btn line" id="kDraft">💾 ' + esc(T("Save draft")) + "</button>") + "</div></div>";
        }
      }
      h += summary();
      o.el.innerHTML = h;
      bind();
    }
    function summary() {
      // per kad: came / total for each kind of meeting, then attended % over all of them
      const L = o.kada;
      if (!L.length) return "";
      const kinds = [["meeting", "Scout meetings"], ["kada", "Kada meetings"], ["prep", "تحضير"], ["group", "Group kada meetings"]];
      const secOf = p => BAS.allSections.find(s => s.id === p.section_id) || {};
      const cnt = (p, k) => { const R = S.Y.filter(r => r.roster_id === p.id && (!k || r.src === k)), ex = secOf(p).att_excused_came;
        return { t: R.length, c: R.filter(r => came(r.status) || (ex && r.status === "excused")).length }; };
      const cell = x => "<td>" + (x.t ? x.c + "/" + x.t : '<span class="z">—</span>') + "</td>";
      let h = '<div class="group-title" style="margin-top:22px">' + esc(T("Kada attendance this year")) + "</div>" +
        '<p class="meta">' + esc(T("Came / meetings, for each kind. The % counts all of them together.")) + "</p>" +
        '<div class="panel tscroll stabw"><table class="stab"><tr><th>' + esc(T("Name")) + "</th>" + (o.sec ? "" : "<th>" + esc(T("Stage")) + "</th>") + "<th>%</th>" + kinds.map(k => "<th>" + esc(T(k[1])) + "</th>").join("") + "</tr>";
      L.forEach(p => {
        const a = cnt(p), pct = a.t ? Math.round(a.c * 100 / a.t) : null, band = pct == null ? "" : pct >= 75 ? "g" : pct >= 50 ? "y" : "r";
        h += '<tr><td dir="auto">' + esc(p.name) + "</td>" + (o.sec ? "" : "<td>" + esc(secName(p.section_id)) + "</td>") + "<td>" + (pct == null ? '<span class="z">—</span>' : '<span class="band ' + band + '">' + pct + "%</span>") + "</td>" + kinds.map(k => cell(cnt(p, k[0]))).join("") + "</tr>";
      });
      return h + "</table></div>";
    }
    function sheet(kind, m) {
      const ov = o.sheet;
      ov.innerHTML = '<div class="sheet" style="max-width:480px"><h2>' + KIND[kind][0] + " " + esc(T(KIND[kind][1])) + (m ? " · " + esc(BAS.fmtDate(m.meet_date, true)) : "") + "</h2>" +
        (m ? "" : '<div class="field"><label>' + esc(T("Date")) + '</label><input type="date" id="kmD" value="' + BAS.todayISO() + '"></div>') +
        '<div class="field"><label>' + esc(T("Starts at")) + '</label><input type="time" id="kmT" value="' + esc(m && m.start_time ? m.start_time.slice(0, 5) : "") + '"></div>' +
        '<div class="field"><label>' + esc(T("Title (optional)")) + '</label><input id="kmN" dir="auto" value="' + esc(m ? m.title || "" : "") + '"></div>' +
        '<div class="actions"><button class="btn gold" id="kmGo">' + esc(T("Save")) + '</button><button class="btn line" id="kmBack">' + esc(T("Back")) + "</button></div></div>";
      ov.hidden = false;
      document.getElementById("kmBack").onclick = () => { ov.hidden = true; };
      document.getElementById("kmGo").onclick = async () => {
        const t = document.getElementById("kmT").value, n = document.getElementById("kmN").value;
        const r = m ? await supabaseClient.rpc("edit_kada_meeting", { p_id: m.id, p_time: t, p_title: n })
                    : await supabaseClient.rpc("add_kada_meeting", { p_section: o.sec || null, p_kind: kind, p_date: document.getElementById("kmD").value, p_time: t, p_title: n });
        if (r.error) return BAS.toast(BAS.errText(r.error), "err");
        ov.hidden = true; load(m ? m.id : r.data);
      };
    }
    async function save(finish) {
      const rows = Object.keys(S.state).filter(id => S.state[id]).map(id => ({ roster_id: Number(id), status: S.state[id] }));
      if (finish && rows.length < o.kada.length && !confirm(T("Some kada aren't marked. Finish anyway? They won't count."))) return;
      const { error } = await supabaseClient.rpc("save_kada_att", { p_meeting: S.cur.id, p_rows: rows, p_finish: finish });
      if (error) return BAS.toast(BAS.errText(error), "err");
      BAS.toast(T(finish ? "Attendance saved" : "Draft saved")); load(S.cur.id);
    }
    function bind() {
      const el = o.el, g = id => document.getElementById(id);
      el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => sheet(b.dataset.add));
      el.querySelectorAll("[data-km]").forEach(b => b.onclick = () => {
        if (S.dirty && !confirm(T("You have changes that aren't saved. Leave them?"))) return;
        S.cur = S.M.find(m => m.id === Number(b.dataset.km)); S.editing = false; S.dirty = false; fill(); draw();
      });
      if (g("kEdit")) g("kEdit").onclick = () => sheet(S.cur.kind, S.cur);
      if (g("kDel")) g("kDel").onclick = async () => {
        if (!confirm(T("Delete this meeting?"))) return;
        const { error } = await supabaseClient.rpc("delete_kada_meeting", { p_id: S.cur.id });
        if (error) return BAS.toast(BAS.errText(error), "err");
        load();
      };
      el.querySelectorAll("[data-kr] [data-ks]").forEach(b => b.onclick = () => {
        if (locked()) return;
        const id = Number(b.closest("[data-kr]").dataset.kr), s = b.dataset.ks;
        S.state[id] = S.state[id] === s ? "" : s; S.dirty = true; draw();
      });
      if (g("kAll")) g("kAll").onclick = () => { o.kada.forEach(p => { if (!S.state[p.id]) S.state[p.id] = "present"; }); S.dirty = true; draw(); };
      if (g("kUnlock")) g("kUnlock").onclick = () => { S.editing = true; draw(); };
      if (g("kCancel")) g("kCancel").onclick = () => { S.editing = false; S.dirty = false; fill(); draw(); };
      if (g("kSaveCh")) g("kSaveCh").onclick = () => save(true);
      if (g("kFin")) g("kFin").onclick = () => save(true);
      if (g("kDraft")) g("kDraft").onclick = () => save(false);
    }
    await load();
    return { reload: load, dirty: () => S.dirty };
  }
  return { mount };
})();
