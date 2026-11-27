// Kada attendance: a stage's kada meetings and تحضير (attendance.html › Kada) and group kada meetings (kada.html).
// The summary counts every kind: scout meetings, kada meetings, تحضير and group kada meetings.
"use strict";
window.KADAV = (function () {
  const esc = s => BAS.esc(s), T = x => (BAS.tr ? BAS.tr(x) : x);
  // a kada meeting (kind "group") is one meeting for every stage; each stage marks its own kada. تحضير is per stage.
  const KIND = { group: ["👥", "Kada meeting"], kada: ["👥", "Kada meeting"], prep: ["📝", "تحضير"] };
  const ST = [["present", "✓", "Present"], ["late", "⏰", "Late"], ["excused", "📝", "Excused"], ["absent", "✗", "Absent"]];
  const came = s => s === "present" || s === "late" || s === "half";
  const fmtT = t => { if (!t) return ""; let [h, m] = t.slice(0, 5).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; };
  const yearStart = () => (BAS.settings && BAS.settings.att_year_start) || "2000-01-01";

  // o: { el, sec (stage id, or null for group kada meetings), kada: [roster rows], sheet: overlay element }
  async function mount(o) {
    const S = { o, M: [], R: [], K: [], Y: [], cur: null, state: {}, editing: false, dirty: false };
    const secsWithKada = [...new Set(o.kada.map(p => p.section_id))];
    o.el.innerHTML = '<div class="empty">' + esc(T("Loading…")) + "</div>";
    async function load(pick) {
      try {
        const base = () => supabaseClient.from("kada_meetings").select("*").gte("meet_date", yearStart());
        S.M = (await BAS.q(base().is("section_id", null))).concat(o.sec ? await BAS.q(base().eq("section_id", o.sec)) : [])
          .sort((a, b) => b.meet_date.localeCompare(a.meet_date) || b.id - a.id);
        const ids = S.M.map(m => m.id);
        S.R = ids.length ? await BAS.q(supabaseClient.from("kada_att").select("*").in("meeting_id", ids)) : [];
        S.K = ids.length ? await BAS.q(supabaseClient.from("kada_takes").select("*").in("meeting_id", ids)) : [];
        const y = await supabaseClient.rpc("kada_year_records", { p_section: o.sec || null });
        S.Y = y.error ? [] : y.data || [];
        const today = BAS.todayISO();
        S.cur = S.M.find(m => m.id === pick) || S.M.find(m => m.meet_date === today) || S.M.find(m => m.meet_date <= today && mStatus(m) !== "done") || S.M.find(m => m.meet_date <= today) || null;
        S.editing = false; S.dirty = false; fill(); draw();
      } catch (e) { o.el.innerHTML = '<div class="msg err">' + esc(BAS.errText(e)) + "</div>"; }
    }
    function fill() {
      S.state = {};
      if (!S.cur) return;
      const R = S.R.filter(r => r.meeting_id === S.cur.id);
      o.kada.forEach(p => { const r = R.find(x => x.roster_id === p.id); S.state[p.id] = r ? r.status : ""; });
    }
    // this stage's part (or, on the group page, every stage's part) is finished
    const takes = m => S.K.filter(k => k.meeting_id === m.id && (o.sec ? k.section_id === o.sec : secsWithKada.indexOf(k.section_id) >= 0));
    const mStatus = m => { const t = takes(m), need = o.sec ? 1 : secsWithKada.length;
      return t.length && t.filter(k => k.status === "done").length >= need ? "done" : t.length ? "draft" : "open"; };
    const locked = () => S.cur && mStatus(S.cur) === "done" && !S.editing;
    const canGroup = BAS.isAdmin() || ["kada_3am", "mosa3ed_3am"].indexOf(BAS.groupRole()) >= 0;
    const canManage = m => BAS.isAdmin() || (m.status === "open" && (m.section_id ? true : canGroup));
    const secName = id => BAS.sectionName ? BAS.sectionName(id) : "";
    function draw() {
      const today = BAS.todayISO();
      let h = '<div class="actions" style="margin:0 0 8px">' +
        // a stage adds its own تحضير; a kada meeting for all stages comes from the team, القائد العام or مساعد القائد العام (Kada attendance page)
        (o.sec ? '<button class="btn line sm" data-add="prep">+ 📝 ' + esc(T("تحضير")) + "</button>"
               : canGroup ? '<button class="btn line sm" data-add="group">+ 👥 ' + esc(T("Kada meeting (all stages)")) + "</button>" : "") +
        (S.cur && canManage(S.cur) ? '<button class="btn danger sm" id="kDel">' + esc(T("Delete this meeting")) + "</button>" : "") + "</div>";
      h += S.M.length ? '<div class="meets">' + S.M.slice().reverse().map(m => '<button class="meet ' + mStatus(m) + (S.cur && m.id === S.cur.id ? " on" : "") + '" data-km="' + m.id + '"><b>' + esc(BAS.fmtDate(m.meet_date, true)) + "</b>" +
          KIND[m.kind][0] + " " + esc(T(KIND[m.kind][1])) + " · " + ({ done: "✅", draft: "📝" }[mStatus(m)] || (m.meet_date > today ? "🕓" : "⬜")) + (m.title ? " · " + esc(m.title) : "") + "</button>").join("") + "</div>"
        : '<div class="empty">' + esc(T(o.sec ? "No تحضير or kada meetings yet." : canGroup ? "No kada meetings yet. Add one with the button above." : "No kada meetings yet.")) + "</div>";
      if (S.cur) {
        const m = S.cur, fut = m.meet_date > today;
        h += '<div class="panel"><div class="req-top"><h3>' + KIND[m.kind][0] + " " + esc(T(KIND[m.kind][1])) + " · " + esc(BAS.fmtDate(m.meet_date, true)) + "<small>" + esc(m.start_time ? T("Starts") + " " + fmtT(m.start_time) : T("No start time")) + (m.title ? " · " + esc(m.title) : "") +
          '</small></h3><div>' + (canManage(m) || m.section_id ? '<button class="linkbtn" id="kEdit">✏️ ' + esc(T(canManage(m) ? "Date / time / title" : "Time / title")) + "</button>" : "") + "</div></div>" +
          (m.kind === "group" ? '<div class="meta">👥 ' + esc(T("One meeting for every stage. Each stage marks its own kada.")) + "</div>" : "") +
          '<div class="meta">' + (takes(m).length ? takes(m).map(k => (k.status === "done" ? "✅ " : "📝 ") + (o.sec ? "" : esc(secName(k.section_id)) + ": ") + esc(T(k.status === "done" ? "Taken by" : "Draft saved by")) + " <bdi>" + esc(k.taken_by_name || "") + "</bdi> · " + esc(BAS.fmtDateTime(k.taken_at))).join("<br>") : esc(T("Not taken yet"))) + "</div></div>";
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
              : mStatus(m) === "done" ? '<button class="btn gold" id="kSaveCh">💾 ' + esc(T("Save changes")) + '</button><button class="btn line" id="kCancel">' + esc(T("Cancel")) + "</button>"
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
      const kinds = [["meeting", "Scout meetings"], ["kada", "Kada meetings"], ["prep", "تحضير"]];
      const secOf = p => BAS.allSections.find(s => s.id === p.section_id) || {};
      const cnt = (p, k) => { const R = S.Y.filter(r => r.roster_id === p.id && (!k || r.src === k)), ex = secOf(p).att_excused_came;
        return { t: R.length, c: R.filter(r => came(r.status) || (ex && r.status === "excused")).length }; };
      const cell = x => "<td>" + (x.t ? x.c + "/" + x.t : '<span class="z">—</span>') + "</td>";
      let h = '<div class="group-title" style="margin-top:22px">' + esc(T("Kada attendance this year")) + "</div>" +
        '<p class="meta">' + esc(T("Came / meetings, for each kind. The % counts all of them together.")) + "</p>" +
        '<div class="panel tscroll stabw"><table class="stab"><tr><th>' + esc(T("Name")) + "</th>" + (o.sec ? "" : "<th>" + esc(T("Stage")) + "</th>") + "<th>%</th>" + kinds.map(k => "<th>" + esc(T(k[1])) + "</th>").join("") + "</tr>";
      const low = L.filter(p => { const a = cnt(p); return a.t && a.c * 100 / a.t < 75; });
      if (low.length) h += '<div class="msg warn">⚠️ ' + esc(T("Under 75%:")) + " " + low.map(p => "<bdi>" + esc(p.name) + "</bdi> (" + Math.round(cnt(p).c * 100 / cnt(p).t) + "%)").join(" · ") + "</div>";
      L.forEach(p => {
        const a = cnt(p), pct = a.t ? Math.round(a.c * 100 / a.t) : null, band = pct == null ? "" : pct >= 75 ? "g" : pct >= 50 ? "y" : "r";
        h += '<tr><td dir="auto">' + esc(p.name) + "</td>" + (o.sec ? "" : "<td>" + esc(secName(p.section_id)) + "</td>") + "<td>" + (pct == null ? '<span class="z">—</span>' : '<span class="band ' + band + '">' + pct + "%</span>") + "</td>" + kinds.map(k => cell(cnt(p, k[0]))).join("") + "</tr>";
      });
      return h + "</table></div>";
    }
    function sheet(kind, m) {
      const ov = o.sheet;
      ov.innerHTML = '<div class="sheet" style="max-width:480px"><h2>' + KIND[kind][0] + " " + esc(T(KIND[kind][1])) + (m ? " · " + esc(BAS.fmtDate(m.meet_date, true)) : "") + "</h2>" +
        (m && !canManage(m) ? "" : '<div class="field"><label>' + esc(T("Date")) + '</label><input type="date" id="kmD" value="' + (m ? m.meet_date : BAS.todayISO()) + '"></div>') +
        (!m && kind === "group" ? '<p class="meta">👥 ' + esc(T("It shows in every stage's Kada tab.")) + "</p>" : "") +
        '<div class="field"><label>' + esc(T("Starts at")) + '</label><input type="time" id="kmT" value="' + esc(m && m.start_time ? m.start_time.slice(0, 5) : "") + '"></div>' +
        '<div class="field"><label>' + esc(T("Title (optional)")) + '</label><input id="kmN" dir="auto" value="' + esc(m ? m.title || "" : "") + '"></div>' +
        '<div class="actions"><button class="btn gold" id="kmGo">' + esc(T("Save")) + '</button><button class="btn line" id="kmBack">' + esc(T("Back")) + "</button></div></div>";
      ov.hidden = false;
      document.getElementById("kmBack").onclick = () => { ov.hidden = true; };
      document.getElementById("kmGo").onclick = async () => {
        const t = document.getElementById("kmT").value, n = document.getElementById("kmN").value;
        const dEl = document.getElementById("kmD");
        const r = m ? await supabaseClient.rpc("edit_kada_meeting", { p_id: m.id, p_date: dEl ? dEl.value : null, p_time: t, p_title: n })
                    : await supabaseClient.rpc("add_kada_meeting", { p_section: o.sec || null, p_kind: kind, p_date: document.getElementById("kmD").value, p_time: t, p_title: n });
        if (r.error) return BAS.toast(BAS.errText(r.error), "err");
        ov.hidden = true; load(m ? m.id : r.data);
      };
    }
    async function save(finish) {
      const rows = Object.keys(S.state).filter(id => S.state[id]).map(id => ({ roster_id: Number(id), status: S.state[id] }));
      if (finish && rows.length < o.kada.length && !confirm(T("Some kada aren't marked. Finish anyway? They won't count."))) return;
      const { error } = await supabaseClient.rpc("save_kada_att", { p_meeting: S.cur.id, p_section: o.sec || null, p_rows: rows, p_finish: finish });
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
