// BAS · face photo tool: finds the face, crops it to 4×6 (portrait), optional white background.
// Everything runs on this device (Google MediaPipe, Apache-2.0, files in /vendor). The photo goes nowhere until it's saved.
// BASPhoto.open(file) → Promise<Blob | null>   (null = cancelled)
(function () {
  const OUT_W = 600, OUT_H = 900, RATIO = OUT_W / OUT_H;
  const T = x => (window.BAS && BAS.tr ? BAS.tr(x) : x), esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const loaded = {};
  const script = src => loaded[src] || (loaded[src] = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("load")); document.head.appendChild(s); }));
  const fileToImg = file => new Promise((ok, bad) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file is not a photo.")); i.src = u; });
  // a working copy no bigger than 1600 px (fast, and enough for 600×900)
  function work(img) {
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c;
  }
  async function findFace(cv) {
    await script("/vendor/fd/face_detection.js");
    const run = model => new Promise(async (ok) => {
      const fd = new window.FaceDetection({ locateFile: f => "/vendor/fd/" + f });
      fd.setOptions({ model, minDetectionConfidence: 0.5 });
      fd.onResults(r => ok((r.detections || []).map(d => d.boundingBox)));
      try { await fd.send({ image: cv }); } catch (e) { ok([]); }
      setTimeout(() => fd.close && fd.close(), 0);
    });
    let b = await run("short"); if (!b.length) b = await run("full");
    if (!b.length) return null;
    b.sort((x, y) => y.width * y.height - x.width * x.height);   // the biggest face
    return b[0];
  }
  async function whiteBg(cv) {
    await script("/vendor/ss/selfie_segmentation.js");
    const mask = await new Promise(async (ok, bad) => {
      const ss = new window.SelfieSegmentation({ locateFile: f => "/vendor/ss/" + f });
      ss.setOptions({ modelSelection: 0 });
      ss.onResults(r => ok(r.segmentationMask));
      try { await ss.send({ image: cv }); } catch (e) { bad(e); }
    });
    const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height;
    const g = o.getContext("2d");
    g.drawImage(mask, 0, 0, o.width, o.height);
    // the mask is "how sure": make it solid inside the person, see-through outside, with a short soft edge
    const id = g.getImageData(0, 0, o.width, o.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const c = Math.max(d[i], d[i + 3]) / 255, a = Math.min(1, Math.max(0, (c - 0.3) / 0.25)); d[i + 3] = Math.round(a * 255); }
    g.putImageData(id, 0, 0);
    g.globalCompositeOperation = "source-in"; g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = "destination-over"; g.fillStyle = "#fff"; g.fillRect(0, 0, o.width, o.height);
    return o;
  }
  // the 4×6 frame around a face: face in the upper middle, room above the head, shoulders below
  function frameFor(cv, box) {
    if (!box) { const h = Math.min(cv.height, cv.width / RATIO); return { cx: cv.width / 2, cy: cv.height / 2, h }; }
    const fh = box.height * cv.height, h = Math.max(fh * 1.9, 60);   // the face box is about half the photo, like a passport photo
    return { cx: box.xCenter * cv.width, cy: box.yCenter * cv.height + h * 0.07, h };
  }
  function draw(ctx, W, H, src, f) {
    const w = f.h * RATIO, k = W / w;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, (W / 2) - f.cx * k, (H / 2) - f.cy * k, src.width * k, src.height * k);
  }

  window.BASPhoto = {
    async open(file) {
      const img = await fileToImg(file), base = work(img);
      const ov = document.createElement("div");
      ov.className = "overlay"; ov.style.zIndex = 300;
      ov.innerHTML = '<div class="sheet" style="max-width:420px;text-align:center"><h2>🙂 ' + esc(T("Face photo")) + '</h2><p class="meta" id="phM">' + esc(T("Finding the face…")) + "</p>" +
        '<canvas id="phC" width="300" height="450" style="width:240px;height:360px;border-radius:10px;border:1px solid var(--line, #ccc);touch-action:none;cursor:grab;background:#fff"></canvas>' +
        '<div class="field" style="margin-top:8px"><label>🔍 ' + esc(T("Zoom")) + '</label><input type="range" id="phZ" min="0.25" max="3" step="0.01" value="1"></div>' +
        '<p class="meta">' + esc(T("Drag the photo to move it.")) + "</p>" +
        '<div class="actions" style="justify-content:center"><button class="btn line" id="phW">⚪ ' + esc(T("White background")) + '</button><button class="btn line" id="phO" hidden>↩ ' + esc(T("Original background")) + "</button></div>" +
        '<div class="actions" style="justify-content:center"><button class="btn gold" id="phOk">' + esc(T("Use this photo")) + '</button><button class="btn line" id="phNo">' + esc(T("Cancel")) + "</button></div></div>";
      document.body.appendChild(ov); ov.hidden = false;
      const $ = id => ov.querySelector("#" + id), c = $("phC"), ctx = c.getContext("2d");
      let src = base, f = frameFor(base, null), h0 = f.h, saved = null;
      const paint = () => draw(ctx, c.width, c.height, src, f);
      paint();
      findFace(base).then(box => {
        f = frameFor(base, box); h0 = f.h; $("phZ").value = 1; paint();
        $("phM").textContent = box ? T("Check it, then press Use this photo.") : T("I couldn't find a face. Move and zoom it yourself.");
      }).catch(() => { $("phM").textContent = T("I couldn't find a face. Move and zoom it yourself."); });
      $("phZ").oninput = () => { f.h = h0 / Number($("phZ").value); paint(); };
      let drag = null;
      c.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, cx: f.cx, cy: f.cy }; c.setPointerCapture(e.pointerId); c.style.cursor = "grabbing"; };
      c.onpointermove = e => { if (!drag) return; const k = (f.h * RATIO) / c.clientWidth; f.cx = drag.cx - (e.clientX - drag.x) * k; f.cy = drag.cy - (e.clientY - drag.y) * k; paint(); };
      c.onpointerup = c.onpointercancel = () => { drag = null; c.style.cursor = "grab"; };
      $("phW").onclick = async () => {
        $("phW").disabled = true; $("phM").textContent = T("Making the background white…");
        try {
          // cut the current 4×6 first (the model works best when the person fills the picture), then whiten that
          const cut = document.createElement("canvas"); cut.width = OUT_W; cut.height = OUT_H; draw(cut.getContext("2d"), OUT_W, OUT_H, base, f);
          src = await whiteBg(cut); saved = { cx: f.cx, cy: f.cy, h: f.h }; f = { cx: OUT_W / 2, cy: OUT_H / 2, h: OUT_H }; h0 = OUT_H; $("phZ").value = 1; paint(); $("phW").hidden = true; $("phO").hidden = false; $("phM").textContent = T("Check the edges (hair, ears). If it looks bad, go back to the original."); }
        catch (e) { $("phM").textContent = T("That didn't work on this photo. Keep the original."); }
        $("phW").disabled = false;
      };
      $("phO").onclick = () => { src = base; if (saved) { f = saved; h0 = saved.h; $("phZ").value = 1; } paint(); $("phO").hidden = true; $("phW").hidden = false; };
      return new Promise(ok => {
        const done = v => { ov.remove(); ok(v); };
        $("phNo").onclick = () => done(null);
        $("phOk").onclick = () => {
          const o = document.createElement("canvas"); o.width = OUT_W; o.height = OUT_H;
          draw(o.getContext("2d"), OUT_W, OUT_H, src, f);
          o.toBlob(b => done(b), "image/jpeg", 0.88);
        };
      });
    }
  };
})();
