// =========================================
// BAS WAREHOUSE: home page (live inventory + request cart)
// =========================================
"use strict";

let STOCK = [];          // from item_stock()
let CART = {};           // "itemId:variantId" -> qty  (variantId empty when the item has no colours)
let CATEGORY = "all";

const $ = id => document.getElementById(id);

// Section cards: open the section's page
document.querySelectorAll(".section-card").forEach(card => {
  card.addEventListener("click", () => {
    location.href = BAS.isApproved() ? "reservations.html" : "auth.html";
  });
});

(async function start() {
  await BAS.init();

  if (!BAS.user || !BAS.isApproved()) {
    showLoginNote();
    renderRecent([]);
    return;
  }

  try {
    const st = await BAS.loadStock();
    STOCK = st.list.filter(i => i.is_active);
    renderFilters();
    renderInventory();
    const res = await BAS.loadReservations(st.byId);
    renderStats(res);
    renderRecent(res);
  } catch (e) {
    $("inventoryItems").innerHTML = '<div class="msg err">' + BAS.esc(BAS.errText(e)) + "</div>";
  }
})();

function showLoginNote() {
  const n = $("loginNote");
  n.hidden = false;
  $("inventoryFilters").hidden = true;
  document.querySelector(".inventory-search").hidden = true;
  if (!BAS.user) {
    n.innerHTML = "<h3>Log in to see the warehouse</h3><p>Leaders can check what's available and request equipment for their stage.</p>" +
      '<a class="primary-btn" href="auth.html">Login or create account</a>';
  } else {
    n.innerHTML = "<h3>Your account is waiting for approval</h3><p>The ma5zan team will approve it soon. Then you can request equipment here.</p>";
  }
}

// ---------- stats ----------
const ACTIVE = ["Pending", "Preparing", "Ready", "Issued", "Partially Returned"];

function renderStats(res) {
  const counted = STOCK.filter(i => i.counted);
  $("statTotal").textContent = STOCK.length;
  $("statAvail").textContent = counted.filter(i => i.available > 0).length;
  $("statActive").textContent = res.filter(r => ACTIVE.indexOf(r.status) >= 0).length;
  $("statAttention").textContent = STOCK.filter(i => !i.counted || i.missing > 0 || i.damaged > 0 || stockLevel(i) !== "ok").length;
  $("statsNote").textContent = BAS.isAdmin()
    ? "* Live numbers. Items needing attention: not counted yet, missing, damaged, low or out."
    : "* Live numbers. Active reservations are your stage's.";
}

function stockLevel(i) {
  if (!i.counted) return "rc";
  if (i.available <= 0) return "out";
  const total = i.quantity + i.repaired_found;
  if (total > 0 && i.available <= total * (BAS.settings.low_pct || 20) / 100) return "low";
  return "ok";
}

// ---------- inventory ----------
function categories() {
  const c = [];
  STOCK.forEach(i => { const k = i.category || "Other"; if (c.indexOf(k) < 0) c.push(k); });
  return c;
}

function renderFilters() {
  const f = $("inventoryFilters");
  const list = ["all"].concat(categories());
  f.innerHTML = list.map(c =>
    '<button class="filter-btn' + (c === CATEGORY ? " active" : "") + '" data-category="' + BAS.esc(c) + '">' +
    (c === "all" ? "All Items" : BAS.icon(c) + " " + BAS.esc(c)) + "</button>").join("");
  f.querySelectorAll(".filter-btn").forEach(b => b.onclick = () => {
    CATEGORY = b.dataset.category; renderFilters(); renderInventory();
  });
}

$("inventorySearch").addEventListener("input", renderInventory);

function renderInventory() {
  const q = $("inventorySearch").value.trim().toLowerCase();
  const list = STOCK.filter(i => {
    const hit = !q || (i.name_en || "").toLowerCase().includes(q) || (i.name_ar || "").includes(q) || (i.category || "").toLowerCase().includes(q);
    return hit && (CATEGORY === "all" || (i.category || "Other") === CATEGORY);
  });
  $("noResults").hidden = list.length !== 0;
  $("inventoryItems").innerHTML = list.map(cardHTML).join("");
  $("inventoryItems").querySelectorAll("[data-plus],[data-minus]").forEach(b => b.onclick = () => {
    change(b.dataset.plus || b.dataset.minus, b.dataset.plus ? 1 : -1);
  });
  renderCart();
}

function activeVariants(i) { return (i.variants || []).filter(v => v.is_active); }

function availFor(key) {
  const parts = key.split(":");
  const i = STOCK.find(x => x.id === Number(parts[0]));
  if (!i || !i.counted) return 0;
  if (parts[1]) { const v = activeVariants(i).find(x => x.id === Number(parts[1])); return v ? v.available : 0; }
  return i.available || 0;
}

function stepper(key, n, max) {
  return '<div class="qty"><button type="button" data-minus="' + key + '"' + (n ? "" : " disabled") + ' aria-label="Less">−</button>' +
    "<span>" + n + "</span>" +
    '<button type="button" data-plus="' + key + '"' + (n < max ? "" : " disabled") + ' aria-label="More">+</button></div>';
}

function cardHTML(i) {
  const vars = activeVariants(i);
  const inCart = Object.keys(CART).some(k => k.split(":")[0] === String(i.id));
  const lvl = stockLevel(i);
  const total = i.quantity + i.repaired_found;
  const pct = !i.counted || total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(i.available / total * 100)));
  const label = !i.counted ? '<span class="pill rc">NOT COUNTED YET</span>'
    : i.available <= 0 ? '<span class="pill out">NONE LEFT</span>'
    : "Available: " + i.available + (lvl === "low" ? ' <span class="pill low">LOW</span>' : "");
  const img = i.image_url
    ? '<img src="' + BAS.esc(i.image_url) + '" alt="' + BAS.esc(i.name_en) + '" loading="lazy">'
    : "<span>" + BAS.icon(i.category) + "</span>";
  let pick = "";
  if (i.counted && vars.length) {
    pick = '<div class="variants">' + vars.map(v => {
      const key = i.id + ":" + v.id;
      return '<div class="vrow"><span class="vname">' + BAS.esc(v.name) + ' <span class="vav">(' + v.available + ")</span></span>" +
        stepper(key, CART[key] || 0, v.available) + "</div>";
    }).join("") + "</div>";
  } else if (i.counted) {
    const key = i.id + ":";
    pick = stepper(key, CART[key] || 0, i.available || 0);
  }
  return '<div class="inventory-card' + (inCart ? " selected" : "") + '">' +
    '<div class="inventory-card-image">' + img + "</div>" +
    '<div class="inventory-card-info">' +
      "<h3>" + BAS.esc(i.name_en) + "</h3>" +
      (i.name_ar ? '<p class="ar">' + BAS.esc(i.name_ar) + "</p>" : "") +
      '<span class="cat">' + BAS.esc(i.category || "Other") + "</span>" +
      '<div class="avail-row"><span>' + label + "</span>" + (i.kind === "Consumable" ? '<small style="color:var(--mut)">used up</small>' : "") + "</div>" +
      (i.counted ? '<div class="avail-bar"><i class="' + lvl + '" style="width:' + pct + '%"></i></div>' : "") +
      pick +
    "</div></div>";
}

function change(key, d) {
  let n = (CART[key] || 0) + d;
  n = Math.max(0, Math.min(n, availFor(key)));
  if (n) CART[key] = n; else delete CART[key];
  renderInventory();
}

function cartLines() {
  return Object.keys(CART).map(k => {
    const parts = k.split(":");
    const i = STOCK.find(x => x.id === Number(parts[0]));
    const v = i && parts[1] ? activeVariants(i).find(x => x.id === Number(parts[1])) : null;
    return i ? { key: k, item: i, variant: v, qty: CART[k] } : null;
  }).filter(Boolean);
}

function renderCart() {
  const lines = cartLines();
  const pieces = lines.reduce((t, l) => t + l.qty, 0);
  $("cartBar").hidden = lines.length === 0;
  document.body.classList.toggle("has-cart", lines.length > 0);
  $("cartCount").textContent = lines.length + (lines.length === 1 ? " item" : " items") + " · " + pieces + " pieces";
}

// ---------- checkout ----------
$("cartOpen").onclick = openCheckout;

function openCheckout() {
  const o = $("checkout");
  const lines = cartLines();
  const borrowerField = BAS.isAdmin()
    ? '<div class="field"><label>For which stage or church service?</label><select id="coBorrower">' +
      '<optgroup label="Scout stages">' + BAS.sections.map(s => '<option value="s' + s.id + '">' + BAS.esc(s.name_ar) + " · " + BAS.esc(s.name_en) + "</option>").join("") + "</optgroup>" +
      '<optgroup label="Other church services">' + BAS.services.filter(v => v.is_active).map(v => '<option value="v' + v.id + '">' + BAS.esc(v.name_ar) + (v.name_en ? " · " + BAS.esc(v.name_en) : "") + "</option>").join("") +
      '<option value="new">+ Another church service…</option></optgroup></select>' +
      '<input id="coNewService" placeholder="Service name" style="margin-top:8px" hidden></div>'
    : '<div class="field"><label>Stage</label><input value="' + BAS.esc(BAS.sectionName(BAS.profile.section_id)) + '" disabled></div>';
  const times = (BAS.settings.times || []).concat(["Other"]);
  o.innerHTML =
    '<div class="sheet" role="dialog" aria-label="Review request">' +
      '<h2>Review your request</h2><p class="sub">Requested by ' + BAS.esc(BAS.profile.full_name) + "</p>" +
      '<div class="panel"><ul class="lines">' + lines.map(l =>
        "<li><span>" + BAS.icon(l.item.category) + " " + BAS.esc(l.item.name_en) + (l.variant ? " (" + BAS.esc(l.variant.name) + ")" : "") +
        "</span><b>" + l.qty + "</b></li>").join("") + "</ul></div>" +
      '<div class="panel">' + borrowerField +
        '<div class="grid2"><div class="field"><label>Date needed</label><input type="date" id="coDate" min="' + BAS.todayISO() + '"></div>' +
        '<div class="field"><label>Time</label><select id="coTime">' + times.map(t => "<option>" + BAS.esc(t) + "</option>").join("") + "</select></div></div>" +
        '<div class="field" id="coTimeOtherWrap" hidden><label>Write the time</label><input id="coTimeOther" placeholder="6:00 PM"></div>' +
        '<div class="field"><label>Meeting place</label><input id="coPlace" placeholder="Roof, villa, el dor el 5…"></div>' +
        '<div class="field"><label>Notes</label><textarea id="coNotes"></textarea></div>' +
        '<div id="coLate" class="msg warn" hidden></div>' +
        '<label class="check"><input type="checkbox" id="coConfirm"> We are responsible for returning all items in good condition.</label>' +
      "</div>" +
      '<div id="coErr" class="msg err" hidden></div>' +
      '<div class="actions"><button class="btn gold" id="coSend">Send request</button><button class="btn line" id="coBack">Back</button></div>' +
    "</div>";
  o.hidden = false;
  try { const p = JSON.parse(localStorage.getItem("basPlace") || "null"); if (p) $("coPlace").value = p; } catch (e) {}
  $("coBack").onclick = () => { o.hidden = true; };
  o.onclick = e => { if (e.target === o) o.hidden = true; };
  $("coTime").onchange = () => { $("coTimeOtherWrap").hidden = $("coTime").value !== "Other"; };
  $("coDate").onchange = lateCheck;
  if ($("coBorrower")) $("coBorrower").onchange = () => { $("coNewService").hidden = $("coBorrower").value !== "new"; };
  $("coSend").onclick = send;
}

function lateCheck() {
  const v = $("coDate").value, w = $("coLate");
  if (!v) { w.hidden = true; return; }
  const days = Math.round((new Date(v + "T00:00:00") - new Date(BAS.todayISO() + "T00:00:00")) / 86400000);
  const min = BAS.settings.min_days || 0;
  w.hidden = days >= min;
  w.textContent = "Requests should be sent at least " + min + " days before. You can still send it, but the team may not be able to prepare everything.";
}

async function borrower() {
  if (!BAS.isAdmin()) return { section: null, service: null };
  const v = $("coBorrower").value;
  if (v[0] === "s") return { section: Number(v.slice(1)), service: null };
  if (v[0] === "v") return { section: null, service: Number(v.slice(1)) };
  const name = $("coNewService").value.trim();
  if (!name) throw new Error("Write the church service name.");
  const existing = BAS.services.find(x => x.name_ar.trim() === name);
  if (existing) return { section: null, service: existing.id };
  const ins = await supabaseClient.from("services").insert({ name_ar: name }).select("id, name_ar, name_en, is_active").single();
  if (ins.error) throw ins.error;
  BAS.services.push(ins.data);
  return { section: null, service: ins.data.id };
}

async function send() {
  const err = $("coErr");
  err.hidden = true;
  const date = $("coDate").value;
  const time = $("coTime").value === "Other" ? $("coTimeOther").value.trim() : $("coTime").value;
  const place = $("coPlace").value.trim();
  const problems = [];
  if (!date) problems.push("the date");
  if (!time) problems.push("the time");
  if (!place) problems.push("the place");
  if (problems.length) { err.textContent = "Fill in " + problems.join(", ") + "."; err.hidden = false; return; }
  if (!$("coConfirm").checked) { err.textContent = "Tick the box to confirm first."; err.hidden = false; return; }

  const btn = $("coSend");
  btn.disabled = true; btn.textContent = "Sending…";
  let who;
  try { who = await borrower(); }
  catch (e) { btn.disabled = false; btn.textContent = "Send request"; err.textContent = BAS.errText(e); err.hidden = false; return; }
  const items = cartLines().map(l => ({ item_id: l.item.id, variant_id: l.variant ? l.variant.id : null, qty: l.qty }));
  const { data, error } = await supabaseClient.rpc("create_reservation", {
    p_meeting_date: date, p_meeting_time: time, p_place: place, p_notes: $("coNotes").value,
    p_items: items, p_section_id: who.section, p_service_id: who.service
  });
  btn.disabled = false; btn.textContent = "Send request";
  if (error) {
    err.textContent = BAS.errText(error); err.hidden = false;
    // someone else may have booked first: refresh the numbers
    try { const st = await BAS.loadStock(); STOCK = st.list.filter(i => i.is_active); trimCart(); renderInventory(); } catch (e) {}
    return;
  }
  try { localStorage.setItem("basPlace", JSON.stringify(place)); } catch (e) {}
  $("checkout").innerHTML = '<div class="sheet"><h2>Request sent ✓</h2><p class="sub">Request number #' + data +
    '. The ma5zan team will prepare it.</p><div class="actions"><a class="btn" href="reservations.html">See my requests</a>' +
    '<button class="btn line" id="coDone">Close</button></div></div>';
  $("coDone").onclick = () => location.reload();
  CART = {};
}

function trimCart() {
  Object.keys(CART).forEach(k => {
    const a = availFor(k);
    if (CART[k] > a) { if (a > 0) CART[k] = a; else delete CART[k]; }
  });
}

// ---------- recent requests ----------
function renderRecent(res) {
  const box = $("reservationsList");
  if (!BAS.isApproved()) {
    box.innerHTML = '<div class="empty-reservations"><span>📋</span><h3>No Reservations Yet</h3><p>Log in to see your stage\'s requests.</p></div>';
    return;
  }
  const list = res.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
  if (!list.length) {
    box.innerHTML = '<div class="empty"><h3>No Reservations Yet</h3><p>Your stage\'s requests will appear here once you make the first one.</p></div>';
    return;
  }
  box.innerHTML = list.map(r =>
    '<div class="req ' + BAS.statusSlug(r.status) + '"><div class="req-top"><h3>#' + r.id + " · " + BAS.borrowerHTML(r) +
    "<small>" + BAS.esc(BAS.fmtDate(r.meeting_date, true)) + " · " + BAS.esc(r.meeting_time || "") + "</small></h3>" + BAS.statusBadge(r.status) + "</div>" +
    '<div class="meta">' + r.items.map(i => BAS.esc(BAS.lineName(i)) + " ×" + i.quantity).join(", ") + "</div></div>").join("");
}
