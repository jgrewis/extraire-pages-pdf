const { PDFDocument } = PDFLib;
// Workers téléchargés avec contrôle d'intégrité (SRI), puis lancés depuis une URL blob:
const verifiedScriptUrl = (url, integrity) =>
  fetch(url, { integrity, mode: "cors", credentials: "omit" })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(b => URL.createObjectURL(new Blob([b], { type: "text/javascript" })));
const pdfWorkerReady = verifiedScriptUrl(
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==",
).then(u => { pdfjsLib.GlobalWorkerOptions.workerSrc = u; });
// isEvalSupported: false neutralise la faille des polices piégées (CVE-2024-4367)
const openPdf = async data => {
  await pdfWorkerReady;
  return pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
};
const $ = id => document.getElementById(id);
const isPdf = f => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
const fmtSize = b => b < 1048576
  ? `${Math.max(1, Math.round(b / 1024))} Ko`
  : `${(b / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
const icon = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function setMsg(el, text, kind = "") { el.textContent = text; el.className = "msg small " + kind; }

// Erreur de dépôt : bordure danger sur la zone et message dessous
function dzError(zone, text) {
  $(zone + "Drop").classList.toggle("error", !!text);
  $(zone + "Err").textContent = text || "";
}

// Même syntaxe que la version Python : "1-3, 5, 8-", "13-14-15-16", "4-2"
function parsePages(text, total) {
  const out = [];
  for (const part of text.trim().split(/[,;\s]+/)) {
    if (!part) continue;
    if (/^\d+(-\d+){2,}$/.test(part)) {
      for (const n of part.split("-").map(Number)) {
        if (n < 1 || n > total) throw new Error(`La page ${n} sort du document (1 à ${total}).`);
        out.push(n - 1);
      }
      continue;
    }
    let start, end, m;
    if ((m = part.match(/^(\d*)-(\d*)$/))) {
      start = m[1] ? +m[1] : 1;
      end = m[2] ? +m[2] : total;
    } else if (/^\d+$/.test(part)) {
      start = end = +part;
    } else {
      throw new Error(`Saisie invalide : « ${part} »`);
    }
    if (start < 1 || start > total || end < 1 || end > total)
      throw new Error(`« ${part} » sort du document (1 à ${total}).`);
    const step = end >= start ? 1 : -1;
    for (let i = start; i !== end + step; i += step) out.push(i - 1);
  }
  if (!out.length) throw new Error("Aucune page indiquée.");
  return out;
}

// [13,14,15,16,20] -> "13-16_20"
function rangesLabel(nums) {
  const parts = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`);
    i = j + 1;
  }
  return parts.join("_");
}

// Demande où enregistrer quand le navigateur le permet (Chrome, Edge), sinon téléchargement classique
async function saveBlob(blob, suggestedName, mime, ext) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName, types: [{ description: ext.toUpperCase(), accept: { [mime]: ["." + ext] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob); await w.close();
      return handle.name;
    } catch (e) {
      if (e.name === "AbortError") return null;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return suggestedName;
}

// Rendu d'une page pdf.js dans un canvas dont le grand côté fait `px` pixels CSS
async function pageCanvas(page, px) {
  const base = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const vp = page.getViewport({ scale: (px / Math.max(base.width, base.height)) * ratio });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  canvas.style.width = canvas.width / ratio + "px";
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas;
}

// Une zone de dépôt s'ouvre au clic n'importe où (le bouton est l'accès clavier)
function wireDrop(zone, input) {
  $(zone + "Drop").addEventListener("click", () => $(input).click());
}

/* ---------- Images (JPG, PNG, WebP, HEIC) ---------- */
const isImageName = f => /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name) || /^image\/(jpeg|png|webp|hei[cf])/.test(f.type);

// Format lu dans les premiers octets : un HEIC arrive souvent sans extension ni type MIME
async function imageKind(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (s, e) => String.fromCharCode(...b.subarray(s, e));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return "heic";
  return null;
}

// Décodeur HEIC (module ES de 3 Mo) chargé au premier HEIC seulement.
// modulepreload vérifie l'empreinte ; import() reprend ensuite le module déjà vérifié.
const HEIC_URL = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.js";
let heicLib = null;
function loadHeic() {
  heicLib ??= new Promise((res, rej) => {
    const l = document.createElement("link");
    l.rel = "modulepreload"; l.href = HEIC_URL; l.crossOrigin = "anonymous";
    l.integrity = "sha384-1a3zcxcf+YeJXpW2iFC/gO1DyJO7ZveuW5UTE3o0Z8rgnukCcjqmKbNI51k8loB0";
    l.onload = () => import(HEIC_URL).then(res, rej);
    l.onerror = () => rej(new Error("impossible de charger le décodeur HEIC"));
    document.head.append(l);
  }).catch(e => { heicLib = null; throw e; });
  return heicLib;
}

// Bitmap redressé selon l'orientation EXIF. Les métadonnées (dont la position GPS)
// ne passent pas le canvas : toute image réenregistrée ou mise en PDF en est débarrassée.
async function loadImage(file) {
  const kind = await imageKind(file);
  if (!kind) throw new Error("format d'image non reconnu");
  return kind === "heic"
    ? loadHeic().then(lib => lib.heicTo({ blob: file, type: "bitmap" }).catch(() => { throw new Error("image illisible"); }))
    : createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => { throw new Error("image illisible"); });
}

// Quart de tour, grand côté limité à maxSide, fond uni (blanc pour le JPG, qui n'a pas de transparence)
function renderImage(bitmap, { rotate = 0, maxSide = 0, background = "" } = {}) {
  const r = ((rotate % 360) + 360) % 360;
  const k = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.round(bitmap.width * k), h = Math.round(bitmap.height * k);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = r % 180 ? [h, w] : [w, h];
  const ctx = canvas.getContext("2d");
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(r * Math.PI / 180);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}
const canvasBlob = (canvas, type, quality) => new Promise((res, rej) =>
  canvas.toBlob(b => b ? res(b) : rej(new Error("conversion impossible")), type, quality));
// Rend la mémoire d'un grand canvas sans attendre le ramasse-miettes
const freeCanvas = c => { c.width = c.height = 0; };

// Mots reconnus, regroupés par ligne, en pixels du canvas. L'OCR travaille sur 2500 px au plus.
async function ocrLines(canvas) {
  const k = Math.min(1, 2500 / Math.max(canvas.width, canvas.height));
  const src = k < 1 ? renderImage(canvas, { maxSide: 2500 }) : canvas;
  try {
    const { data } = await (await loadOcr()).recognize(src, {}, { blocks: true });
    const box = b => ({ x0: b.x0 / k, y0: b.y0 / k, x1: b.x1 / k, y1: b.y1 / k });
    return (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines)).map(l => ({
      bbox: box(l.bbox), baseline: box(l.baseline),
      // Mots trop incertains écartés (bruit sur une image sans texte)
      words: l.words.filter(w => w.text.trim() && w.confidence >= 50).map(w => ({ text: w.text.trim(), bbox: box(w.bbox) })),
    })).filter(l => l.words.length);
  } finally {
    if (src !== canvas) freeCanvas(src);
  }
}

// Helvetica ne couvre que WinAnsi : lettre de base pour les accents inconnus, sinon caractère omis
const winAnsiChars = new Map();
function winAnsi(font, text) {
  return [...text.normalize("NFKC")].map(ch => {
    if (!winAnsiChars.has(ch)) {
      const ok = [ch, ch.normalize("NFD")[0]].find(c => { try { font.encodeText(c); return true; } catch { return false; } });
      winAnsiChars.set(ch, ok || "");
    }
    return winAnsiChars.get(ch);
  }).join("");
}

// Texte invisible (mode de rendu 3) posé sur chaque mot : recherche et copier-coller dans le PDF.
// Chaque mot, suivi d'une espace, est étiré jusqu'au mot suivant pour que la sélection tombe juste.
function drawOcrLayer(page, lines, font, rect, cw, ch) {
  const sx = rect.width / cw, sy = rect.height / ch;
  const X = x => rect.x + x * sx, Y = y => rect.y + rect.height - y * sy;
  page.pushOperators(PDFLib.setTextRenderingMode(PDFLib.TextRenderingMode.Invisible));
  for (const l of lines) {
    const size = Math.max(1, (l.bbox.y1 - l.bbox.y0) * sy);
    const b = l.baseline, slope = (b.y1 - b.y0) / ((b.x1 - b.x0) || 1);
    l.words.forEach((w, i) => {
      const last = i === l.words.length - 1;
      const text = winAnsi(font, w.text) + (last ? "" : " ");
      if (!text.trim()) return;
      const natural = font.widthOfTextAtSize(text, size);
      const target = ((last ? w.bbox.x1 : l.words[i + 1].bbox.x0) - w.bbox.x0) * sx;
      page.pushOperators(PDFLib.setCharacterSqueeze(Math.min(1000, Math.max(10, 100 * target / natural))));
      page.drawText(text, { x: X(w.bbox.x0), y: Y(b.y0 + slope * (w.bbox.x0 - b.x0)), size, font });
    });
  }
  page.pushOperators(PDFLib.setCharacterSqueeze(100), PDFLib.setTextRenderingMode(PDFLib.TextRenderingMode.Fill));
}

// Une image (canvas déjà tourné, réduit, sur fond blanc) -> une page du document.
// A4 : orientée comme l'image, centrée, marge d'1 cm. Sinon : taille de l'image à 96 ppp.
const A4 = [595.28, 841.89], A4_MARGIN = 28.35, MAX_PAGE = 14400;
const pdfFonts = new WeakMap();
async function addImagePage(doc, canvas, { pageSize = "a4", ocr = false, quality = 0.9 } = {}) {
  const jpg = await doc.embedJpg(await (await canvasBlob(canvas, "image/jpeg", quality)).arrayBuffer());
  const cw = canvas.width, ch = canvas.height;
  let size, rect;
  if (pageSize === "a4") {
    size = cw > ch ? [A4[1], A4[0]] : A4;
    const k = Math.min((size[0] - 2 * A4_MARGIN) / cw, (size[1] - 2 * A4_MARGIN) / ch);
    rect = { x: (size[0] - cw * k) / 2, y: (size[1] - ch * k) / 2, width: cw * k, height: ch * k };
  } else {
    const k = Math.min(0.75, MAX_PAGE / Math.max(cw, ch));
    size = [cw * k, ch * k];
    rect = { x: 0, y: 0, width: size[0], height: size[1] };
  }
  const page = doc.addPage(size);
  page.drawImage(jpg, rect);
  if (ocr) {
    if (!pdfFonts.has(doc)) pdfFonts.set(doc, await doc.embedFont(PDFLib.StandardFonts.Helvetica));
    drawOcrLayer(page, await ocrLines(canvas), pdfFonts.get(doc), rect, cw, ch);
  }
  return page;
}

/* ---------- Navigation entre les outils ---------- */
const VIEWS = { "#extraire": "extract", "#fusionner": "merge", "#convertir": "convert", "#markdown": "markdown", "#visionneuse": "viewer" };
const TITLES = { home: "Outils PDF", extract: "Extraire des pages", merge: "Fusionner", convert: "Convertisseur", markdown: "PDF vers Markdown", viewer: "Visionneuse" };
let view = "home";
const activeTab = () => view;
function showView() {
  const prev = view;
  view = VIEWS[location.hash] || "home";
  document.querySelectorAll("main > .view").forEach(s => { s.hidden = s.dataset.view !== view; });
  document.querySelectorAll(".site-nav a").forEach(a => {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.title = view === "home" ? TITLES.home : `${TITLES[view]} · Outils PDF`;
  if (prev !== view) scrollTo(0, 0);
}
function go(name) { location.hash = Object.keys(VIEWS).find(h => VIEWS[h] === name) || ""; }
addEventListener("hashchange", showView);
showView();

/* ---------- Extraire des pages ---------- */
const X = { src: null, size: 0 };  // src : { name, lib (pdf-lib), js (pdf.js), count }
const xGrid = $("xGrid");
const xItems = () => [...xGrid.children];
const xChecked = () => xItems().filter(el => el.querySelector("input").checked);

// Rendu des vignettes seulement quand elles approchent de l'écran
const xObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    xObserver.unobserve(e.target);
    xRenderThumb(e.target);
  }
}, { rootMargin: "300px" });

async function xRenderThumb(el) {
  const src = X.src;
  try {
    const canvas = await pageCanvas(await src.js.getPage(+el.dataset.page), 120);
    if (X.src === src) el.querySelector(".pg-img").replaceChildren(canvas);
  } catch (e) {
    el.querySelector(".pg-img").textContent = "?";
  }
}

function xThumb(n) {
  const el = document.createElement("label");
  el.className = "thumb";
  el.dataset.page = n;
  el.innerHTML = `<input type="checkbox" checked aria-label="Page ${n}"><span class="pg"><span class="pg-img"></span><span class="ck">${icon("check")}</span></span><span class="small muted">Page ${n}</span>`;
  return el;
}

function xRefresh() {
  const n = xItems().length, s = xChecked().length;
  $("xCount").textContent = `${s} / ${plural(n, "page")} ${s > 1 ? "sélectionnées" : "sélectionnée"}`;
  $("xExport").disabled = s === 0;
  sendRefresh();
}

function xClose() {
  if (X.src) X.src.js.destroy();
  X.src = null;
  xItems().forEach(el => xObserver.unobserve(el));
  xGrid.replaceChildren();
  $("xCardThumb").replaceChildren();
  $("xPages").value = "";
  setMsg($("xMsg"), "");
  $("xStart").hidden = false;
  $("xWork").hidden = true;
}

async function xOpen(files) {
  const list = [...files];
  const file = list.find(isPdf);
  if (!file) { dzError("x", "Ce fichier n'est pas un PDF."); return; }
  let src;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const lib = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // pdf.js transfère les données à son worker : on lui donne une copie
    const js = await openPdf(bytes.slice());
    src = { name: file.name.replace(/\.pdf$/i, ""), lib, js, count: lib.getPageCount() };
  } catch (e) {
    dzError("x", `Impossible d'ouvrir « ${file.name} » : fichier illisible ou protégé.`);
    return;
  }
  xClose();
  dzError("x", "");
  X.src = src; X.size = file.size;
  for (let n = 1; n <= src.count; n++) {
    const el = xThumb(n);
    xGrid.append(el);
    xObserver.observe(el);
  }
  $("xCardName").textContent = file.name;
  $("xCardMeta").textContent = `${plural(src.count, "page")} · ${fmtSize(file.size)}`;
  $("xStart").hidden = true;
  $("xWork").hidden = false;
  xRefresh();
  if (list.length > 1)
    setMsg($("xMsg"), `Seul « ${file.name} » a été ouvert. Pour assembler plusieurs fichiers, utilisez Fusionner.`);
  src.js.getPage(1).then(page => pageCanvas(page, 46))
    .then(c => { if (X.src === src) $("xCardThumb").replaceChildren(c); }).catch(() => {});
}

// Coche les pages saisies et les place en tête, dans l'ordre saisi
function xApplySelection() {
  let order;
  try { order = [...new Set(parsePages($("xPages").value, X.src.count))].map(i => i + 1); }
  catch (e) { setMsg($("xMsg"), e.message, "error"); return; }
  const byPage = new Map(xItems().map(el => [+el.dataset.page, el]));
  const keep = new Set(order);
  const rest = [...byPage.keys()].filter(n => !keep.has(n)).sort((a, b) => a - b);
  for (const n of [...order, ...rest]) {
    const el = byPage.get(n);
    el.querySelector("input").checked = keep.has(n);
    xGrid.append(el);
  }
  setMsg($("xMsg"), "");
  xRefresh();
}

// Pages choisies, dans l'ordre de la grille, en un seul PDF
async function xBuild(indices) {
  const out = await PDFDocument.create();
  (await out.copyPages(X.src.lib, indices)).forEach(p => out.addPage(p));
  return out.save();
}
const xBaseName = list => `${X.src.name}_pages_${rangesLabel(list.map(i => i + 1))}`;

async function xExport() {
  const list = xChecked().map(el => +el.dataset.page - 1);
  if (!list.length) { setMsg($("xMsg"), "Aucune page sélectionnée.", "error"); return; }
  const { src } = X;
  const build = xBuild;
  const base = xBaseName(list);
  $("xExport").disabled = true;
  setMsg($("xMsg"), "Préparation…");
  try {
    let saved;
    if (document.querySelector("input[name=xMode]:checked").value === "separate") {
      const zip = new JSZip();
      const pad = String(list.length).length;
      for (const [i, p] of list.entries())
        zip.file(`${String(i + 1).padStart(pad, "0")}_${src.name}_page_${p + 1}.pdf`, await build([p]));
      saved = await saveBlob(await zip.generateAsync({ type: "blob" }), base + ".zip", "application/zip", "zip");
    } else {
      saved = await saveBlob(new Blob([await build(list)], { type: "application/pdf" }), base + ".pdf", "application/pdf", "pdf");
    }
    setMsg($("xMsg"), saved ? `Vos pages sont prêtes : ${saved}` : "Enregistrement annulé.", saved ? "ok" : "");
  } catch (e) {
    setMsg($("xMsg"), "Erreur : " + e.message, "error");
  } finally {
    xRefresh();
  }
}

wireDrop("x", "xFile");
$("xFile").addEventListener("change", e => { xOpen(e.target.files); e.target.value = ""; });
$("xRemove").addEventListener("click", xClose);
xGrid.addEventListener("change", xRefresh);
$("xApply").addEventListener("click", xApplySelection);
$("xPages").addEventListener("keydown", e => { if (e.key === "Enter") xApplySelection(); });
$("xAll").addEventListener("click", () => { xItems().forEach(el => { el.querySelector("input").checked = true; }); xRefresh(); });
$("xNone").addEventListener("click", () => { xItems().forEach(el => { el.querySelector("input").checked = false; }); xRefresh(); });
$("xExport").addEventListener("click", xExport);
new Sortable(xGrid, { animation: 150, ghostClass: "ghost", forceFallback: true, fallbackClass: "dragging", fallbackOnBody: true,
                      fallbackTolerance: 4, delay: 150, delayOnTouchOnly: true, onEnd: xRefresh });

/* ---------- Cartes de fichiers PDF et images (Fusionner, Convertisseur) ---------- */
const IMG_LABEL = { jpg: "JPG", png: "PNG", webp: "WebP", heic: "HEIC" };
const PDF_MIME = "application/pdf";
const pdfBlob = bytes => new Blob([bytes], { type: PDF_MIME });
const radio = name => document.querySelector(`input[name="${name}"]:checked`).value;

// Fichier déposé -> élément de liste : PDF chargé par pdf-lib, ou image avec vignette et dimensions
async function readItem(file) {
  if (isPdf(file)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let lib, count;
    try { lib = await PDFDocument.load(bytes, { ignoreEncryption: true }); count = lib.getPageCount(); }
    catch (e) { throw new Error(`« ${file.name} » est illisible ou protégé`); }
    return { kind: "pdf", file, bytes, lib, name: file.name.replace(/\.pdf$/i, ""), size: file.size, count };
  }
  const type = await imageKind(file);
  if (!type) throw new Error(`« ${file.name} » n'est ni un PDF ni une image JPG, PNG, WebP ou HEIC`);
  let bm;
  try { bm = await loadImage(file); }
  catch (e) { throw new Error(`« ${file.name} » : ${e.message}`); }
  const item = { kind: "image", file, type, name: file.name.replace(/\.[^.]+$/, "") || file.name, size: file.size, count: 1,
                 rotate: 0, w: bm.width, h: bm.height, thumb: renderImage(bm, { maxSide: 92 }) };
  bm.close();
  return item;
}

function itemSub(it) {
  if (it.kind === "pdf") return `PDF · ${plural(it.count, "page")} · ${fmtSize(it.size)}`;
  const [w, h] = it.rotate % 180 ? [it.h, it.w] : [it.w, it.h];
  return `${IMG_LABEL[it.type]} · ${w} × ${h} px · ${fmtSize(it.size)}`;
}

function fileCard(id, it, onRemove) {
  const li = document.createElement("li");
  li.className = "fcard";
  li.dataset.id = id;
  li.innerHTML = `<span class="grip" title="Glisser pour déplacer">${icon("grip")}</span><span class="fthumb"></span>
    <div class="fmeta"><div class="fname body"></div><div class="fsub small"></div></div>
    ${it.kind === "image" ? `<button type="button" class="ib" data-act="rotate" aria-label="Tourner d'un quart de tour" title="Tourner d'un quart de tour">${icon("rotate")}</button>` : ""}
    <button type="button" class="ib fx" data-act="remove" aria-label="Retirer" title="Retirer">${icon("x")}</button>`;
  li.querySelector(".fname").textContent = it.file.name;
  li.querySelector(".fname").title = it.file.name;
  const sub = li.querySelector(".fsub");
  sub.textContent = itemSub(it);
  const thumb = li.querySelector(".fthumb");
  li.querySelector('[data-act="remove"]').addEventListener("click", () => { li.remove(); onRemove(); });
  if (it.kind === "image") {
    const draw = () => thumb.replaceChildren(renderImage(it.thumb, { rotate: it.rotate, background: "#fff" }));
    li.querySelector('[data-act="rotate"]').addEventListener("click", () => {
      it.rotate = (it.rotate + 90) % 360;
      draw(); sub.textContent = itemSub(it);
    });
    draw();
  } else {
    // Vignette de la première page
    openPdf(it.bytes.slice()).then(async js => {
      try { thumb.replaceChildren(await pageCanvas(await js.getPage(1), 46)); }
      finally { js.destroy(); }
    }).catch(() => {});
  }
  return li;
}

// Ajoute les fichiers un par un à une liste ; renvoie les erreurs
async function addItems(fileList, store, list, msgEl, onRemove) {
  const errors = [];
  for (const file of [...fileList]) {
    setMsg(msgEl, `Lecture de ${file.name}…`);
    try {
      const it = await readItem(file);
      const id = store.nextId++;
      store.items.set(id, it);
      list.append(fileCard(id, it, () => { store.items.delete(id); onRemove(); }));
    } catch (e) {
      errors.push(e.message);
    }
  }
  setMsg(msgEl, "");
  return errors;
}

// Image -> page PDF : décodée, tournée, réduite, sur fond blanc, puis libérée
async function imagePage(doc, it, opts) {
  const bm = await loadImage(it.file);
  const c = renderImage(bm, { rotate: it.rotate, maxSide: opts.maxSide, background: "#fff" });
  bm.close();
  try { await addImagePage(doc, c, opts); }
  finally { freeCanvas(c); }
}

/* ---------- Fusionner ---------- */
const M = { items: new Map(), nextId: 1, busy: false };
const mList = $("mList");
const mOrdered = () => [...mList.children].map(li => M.items.get(+li.dataset.id));

function mRefresh() {
  const files = mOrdered();
  const pagesTotal = files.reduce((s, f) => s + f.count, 0);
  $("mStart").hidden = files.length > 0;
  $("mWork").hidden = files.length === 0;
  $("mImgOpts").hidden = !files.some(f => f.kind === "image");
  $("mCount").textContent = files.length === 1
    ? "Ajoutez au moins un autre fichier."
    : `${plural(files.length, "fichier")} · ${plural(pagesTotal, "page")}`;
  $("mMerge").disabled = files.length < 2 || M.busy;
  sendRefresh();
}

async function mAdd(fileList) {
  const errors = await addItems(fileList, M, mList, $("mMsg"), () => { setMsg($("mMsg"), ""); mRefresh(); });
  const text = errors.length ? errors.join(" · ") + "." : "";
  if (M.items.size) { dzError("m", ""); setMsg($("mMsg"), text, text ? "error" : ""); }
  else dzError("m", text);
  mRefresh();
}

// Les PDF sont copiés tels quels ; chaque image devient une page
async function mBuild(files, progress = () => {}) {
  const out = await PDFDocument.create();
  const opts = { pageSize: radio("mSize"), ocr: $("mOcr").checked };
  const imgs = files.filter(f => f.kind === "image").length;
  const ocr = opts.ocr && imgs > 0;
  if (ocr) ocrHold();
  try {
    let n = 0;
    for (const f of files) {
      if (f.kind === "pdf") (await out.copyPages(f.lib, f.lib.getPageIndices())).forEach(p => out.addPage(p));
      else {
        progress(`Image ${++n} / ${imgs}${ocr ? " · lecture du texte (OCR)" : ""}…`);
        await imagePage(out, f, opts);
      }
    }
  } finally {
    if (ocr) ocrRelease();
  }
  return out.save();
}

async function mMerge() {
  const files = mOrdered();
  if (files.length < 2 || M.busy) return;
  M.busy = true;
  mRefresh();
  setMsg($("mMsg"), "Fusion en cours…");
  try {
    const blob = pdfBlob(await mBuild(files, s => setMsg($("mMsg"), s)));
    const saved = await saveBlob(blob, "fusion.pdf", "application/pdf", "pdf");
    setMsg($("mMsg"), saved ? `Votre PDF est prêt : ${saved}` : "Enregistrement annulé.", saved ? "ok" : "");
  } catch (e) {
    setMsg($("mMsg"), "Erreur : " + e.message, "error");
  } finally {
    M.busy = false;
    mRefresh();
  }
}

wireDrop("m", "mFile");
$("mAdd").addEventListener("click", () => $("mFile").click());
$("mFile").addEventListener("change", e => { mAdd(e.target.files); e.target.value = ""; });
$("mMerge").addEventListener("click", mMerge);
$("mReset").addEventListener("click", () => { if (M.busy) return; M.items.clear(); mList.replaceChildren(); setMsg($("mMsg"), ""); dzError("m", ""); mRefresh(); });
new Sortable(mList, { handle: ".grip", animation: 150, ghostClass: "ghost", forceFallback: true, fallbackClass: "dragging", fallbackOnBody: true });

/* ---------- Convertisseur ---------- */
const C = { items: new Map(), nextId: 1, busy: false };
const cList = $("cList");
const cOrdered = () => [...cList.children].map(li => C.items.get(+li.dataset.id));
const cCounts = items => { const imgs = items.filter(i => i.kind === "image").length; return { imgs, pdfs: items.length - imgs }; };

function cRefresh() {
  const items = cOrdered();
  const { imgs, pdfs } = cCounts(items);
  $("cStart").hidden = items.length > 0;
  $("cWork").hidden = items.length === 0;
  // « PDF allégé » ne concerne que les PDF de la liste
  const light = document.querySelector('input[name="cTo"][value="light"]');
  light.disabled = !pdfs;
  if (light.checked && !pdfs) document.querySelector('input[name="cTo"][value="jpg"]').checked = true;
  const to = radio("cTo");
  $("cQuality").hidden = to !== "jpg";
  $("cMaxBox").hidden = !(to === "jpg" || to === "png" || (to === "pdf" && imgs));
  $("cPdfOpts").hidden = !(to === "pdf" && imgs);
  $("cSplitBox").hidden = !(to === "pdf" && items.length > 1);
  $("cLightNote").hidden = to !== "light";
  $("cGps").hidden = !imgs || to === "light";
  $("cCount").textContent = [imgs && plural(imgs, "image"), pdfs && `${pdfs} PDF`].filter(Boolean).join(" · ");
  $("cGo").disabled = C.busy || !items.length;
  sendRefresh();
}

async function cAdd(fileList) {
  const errors = await addItems(fileList, C, cList, $("cMsg"), () => { setMsg($("cMsg"), ""); cRefresh(); });
  const text = errors.length ? errors.join(" · ") + "." : "";
  if (C.items.size) { dzError("c", ""); setMsg($("cMsg"), text, text ? "error" : ""); }
  else dzError("c", text);
  cRefresh();
}

// Image -> une image ; PDF -> une image par page (200 ppp, 5000 px au plus)
async function toImages(it, to, { maxSide, quality }, step) {
  const mime = to === "jpg" ? "image/jpeg" : "image/png";
  if (it.kind === "image") {
    if (it.type === "heic") step("décodage HEIC");
    const bm = await loadImage(it.file);
    const c = renderImage(bm, { rotate: it.rotate, maxSide, background: to === "jpg" ? "#fff" : "" });
    bm.close();
    try { return [{ name: `${it.name}.${to}`, blob: await canvasBlob(c, mime, quality) }]; }
    finally { freeCanvas(c); }
  }
  const js = await openPdf(it.bytes.slice());
  const out = [];
  try {
    for (let n = 1; n <= js.numPages; n++) {
      step(`page ${n} / ${js.numPages}`);
      const page = await js.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(200 / 72, (maxSide || 5000) / Math.max(base.width, base.height)) });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      // Rendu « impression » : celui d'un export, et il continue quand l'onglet passe en arrière-plan
      await page.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
      out.push({ name: js.numPages === 1 ? `${it.name}.${to}` : `${it.name}_p${n}.${to}`, blob: await canvasBlob(c, mime, quality) });
      freeCanvas(c); page.cleanup();
    }
  } finally {
    js.destroy();
  }
  return out;
}

async function appendToPdf(doc, it, opts, step) {
  if (it.kind === "pdf") (await doc.copyPages(it.lib, it.lib.getPageIndices())).forEach(p => doc.addPage(p));
  else { step([it.type === "heic" && "décodage HEIC", opts.ocr && "lecture du texte (OCR)"].filter(Boolean).join(", ")); await imagePage(doc, it, opts); }
}

// Dans un PDF, l'orientation EXIF d'un JPEG ne compte pas : on retire les segments APP1 avant de le décoder
function stripExif(b) {
  const parts = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda) {
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    if (b[i + 1] !== 0xe1) parts.push(b.subarray(i, end));
    i = end;
  }
  parts.push(b.subarray(i));
  return new Blob(parts, { type: "image/jpeg" });
}

// Photos JPEG du PDF (8 bits, RVB, gris ou CMJN, sans masque ni Decode) réduites à 2000 px et recompressées à 70 %.
// Une image n'est remplacée que si elle gagne au moins 10 % ; le reste du PDF (texte, liens, formulaires) n'est pas touché.
async function lightenPdf(it, step) {
  let doc;
  try { doc = await PDFDocument.load(it.bytes, { updateMetadata: false, ignoreEncryption: true }); }
  catch (e) { throw new Error("PDF illisible"); }
  // Flux chiffrés : impossibles à décoder et à réécrire sans casser le fichier
  if (doc.isEncrypted) throw new Error("PDF protégé, impossible de l'alléger");
  const ctx = doc.context, N = n => PDFLib.PDFName.of(n);
  const num = v => (v instanceof PDFLib.PDFNumber ? v.asNumber() : NaN);
  const okSpace = cs => {
    cs = ctx.lookup(cs);
    if ([N("DeviceRGB"), N("DeviceGray"), N("DeviceCMYK")].includes(cs)) return true;
    return cs instanceof PDFLib.PDFArray && cs.size() === 2 && ctx.lookup(cs.get(0)) === N("ICCBased");
  };
  // Une image qui sert de masque (SMask) d'une autre doit rester en niveaux de gris : on n'y touche pas
  const masks = new Set();
  for (const [, obj] of ctx.enumerateIndirectObjects())
    if (obj instanceof PDFLib.PDFRawStream && obj.dict.get(N("SMask")) instanceof PDFLib.PDFRef) masks.add(obj.dict.get(N("SMask")).toString());
  const targets = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (masks.has(ref.toString())) continue;
    if (!(obj instanceof PDFLib.PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(N("Subtype")) !== N("Image")) continue;
    let f = ctx.lookup(d.get(N("Filter")));
    if (f instanceof PDFLib.PDFArray) f = f.size() === 1 ? ctx.lookup(f.get(0)) : null;
    if (f !== N("DCTDecode") || num(ctx.lookup(d.get(N("BitsPerComponent")))) !== 8) continue;
    if (["SMask", "Mask", "Decode", "ImageMask", "SMaskInData"].some(k => d.has(N(k))) || !okSpace(d.get(N("ColorSpace")))) continue;
    targets.push([ref, obj]);
  }
  let changed = 0;
  for (const [k, [ref, obj]] of targets.entries()) {
    step(`photo ${k + 1} / ${targets.length}`);
    const w = num(ctx.lookup(obj.dict.get(N("Width")))), h = num(ctx.lookup(obj.dict.get(N("Height"))));
    let bm;
    try { bm = await createImageBitmap(stripExif(obj.contents)); } catch (e) { continue; }
    if (bm.width !== w || bm.height !== h) { bm.close(); continue; }
    const c = renderImage(bm, { maxSide: 2000, background: "#fff" });
    bm.close();
    const jpg = new Uint8Array(await (await canvasBlob(c, "image/jpeg", 0.7)).arrayBuffer());
    if (jpg.length < obj.contents.length * 0.9) {
      const dict = obj.dict.clone(ctx);
      dict.delete(N("DecodeParms")); dict.delete(N("Length"));
      dict.set(N("Width"), PDFLib.PDFNumber.of(c.width));
      dict.set(N("Height"), PDFLib.PDFNumber.of(c.height));
      dict.set(N("ColorSpace"), N("DeviceRGB"));
      dict.set(N("Filter"), N("DCTDecode"));
      ctx.assign(ref, PDFLib.PDFRawStream.of(dict, jpg));
      changed++;
    }
    freeCanvas(c);
  }
  if (!changed) return null;
  const out = await doc.save({ updateFieldAppearances: false });
  return out.length < it.bytes.length ? out : null;
}

const cSplit = items => radio("cTo") === "pdf" && items.length > 1 && radio("cSplit") === "separate";

// Conversion de la liste -> { outputs: [{ name, blob }], notes, errors }. Un fichier à la fois.
async function cProduce(items, progress) {
  const to = radio("cTo"), maxSide = +radio("cMax"), quality = radio("cQuality") === "light" ? 0.7 : 0.9;
  const pdfOpts = { pageSize: radio("cSize"), ocr: $("cOcr").checked, maxSide };
  const outputs = [], notes = [], errors = [];
  if (to === "light") {
    const skipped = items.filter(i => i.kind === "image").length;
    if (skipped) notes.push(`${plural(skipped, "image")} ignorée${skipped > 1 ? "s" : ""}`);
    items = items.filter(i => i.kind === "pdf");
  }
  const single = to === "pdf" && !cSplit(items);
  const ocr = to === "pdf" && pdfOpts.ocr && items.some(i => i.kind === "image");
  const doc = single ? await PDFDocument.create() : null;
  if (ocr) ocrHold();
  try {
    for (const [i, it] of items.entries()) {
      const step = s => progress(`${i + 1} / ${items.length} · ${it.file.name}${s ? " · " + s : ""}`);
      step("");
      try {
        if (to === "jpg" || to === "png") outputs.push(...await toImages(it, to, { maxSide, quality }, step));
        else if (single) await appendToPdf(doc, it, pdfOpts, step);
        else if (to === "pdf") {
          const d = await PDFDocument.create();
          await appendToPdf(d, it, pdfOpts, step);
          outputs.push({ name: it.name + ".pdf", blob: pdfBlob(await d.save()) });
        } else {
          const r = await lightenPdf(it, step);
          if (!r) notes.push(`${it.file.name} : déjà optimisé`);
          else {
            outputs.push({ name: it.name + "_allégé.pdf", blob: pdfBlob(r) });
            notes.push(`${it.file.name} : ${fmtSize(it.size)} → ${fmtSize(r.length)} (−${Math.round(100 * (1 - r.length / it.size))} %)`);
          }
        }
      } catch (e) {
        errors.push(`« ${it.file.name} » : ${e.message}`);
      }
    }
    if (single && doc.getPageCount())
      outputs.push({ name: (items.length === 1 ? items[0].name : "conversion") + ".pdf", blob: pdfBlob(await doc.save()) });
  } finally {
    if (ocr) ocrRelease();
  }
  return { outputs, notes, errors };
}

function uniqueName(used, name) {
  const dot = name.lastIndexOf(".");
  let n = name, i = 2;
  while (used.has(n)) n = `${name.slice(0, dot)} (${i++})${name.slice(dot)}`;
  used.add(n);
  return n;
}

async function cConvert() {
  const items = cOrdered();
  if (!items.length || C.busy) return;
  C.busy = true;
  cRefresh();
  const msg = $("cMsg");
  setMsg(msg, "Conversion…");
  try {
    const { outputs, notes, errors } = await cProduce(items, s => setMsg(msg, `Conversion ${s}…`));
    let saved = null;
    if (outputs.length === 1) {
      const { blob, name } = outputs[0];
      saved = await saveBlob(blob, name, blob.type, name.split(".").pop());
    } else if (outputs.length > 1) {
      const zip = new JSZip(), used = new Set();
      outputs.forEach(o => zip.file(uniqueName(used, o.name), o.blob));
      saved = await saveBlob(await zip.generateAsync({ type: "blob" }), (items.length === 1 ? items[0].name : "conversion") + ".zip", "application/zip", "zip");
    }
    const parts = [];
    if (saved) parts.push(`Prêt : ${saved}` + (outputs.length > 1 ? ` (${plural(outputs.length, "fichier")})` : ""));
    else if (outputs.length) parts.push("Enregistrement annulé.");
    if (saved && radio("cTo") !== "light" && items.some(i => i.kind === "image")) parts.push("position GPS et métadonnées retirées");
    parts.push(...notes, ...errors);
    setMsg(msg, parts.join(" · "), errors.length ? "error" : saved ? "ok" : "");
  } catch (e) {
    setMsg(msg, "Erreur : " + e.message, "error");
  } finally {
    C.busy = false;
    cRefresh();
  }
}

// « Envoyer vers » : seulement quand la conversion donne un seul PDF
function cSinglePdf() {
  const items = cOrdered(), { pdfs } = cCounts(items), to = radio("cTo");
  return items.length > 0 && ((to === "pdf" && !cSplit(items)) || (to === "light" && pdfs === 1));
}

async function cBuildPdf() {
  C.busy = true;
  cRefresh();
  try {
    const items = cOrdered();
    const { outputs, errors } = await cProduce(items, s => setMsg($("cMsg"), `Conversion ${s}…`));
    if (errors.length) throw new Error(errors.join(" · "));
    // PDF allégé sans gain : on envoie l'original
    const pdf = items.find(i => i.kind === "pdf");
    if (!outputs.length) return { bytes: pdf.bytes.slice(), name: pdf.name };
    return { bytes: new Uint8Array(await outputs[0].blob.arrayBuffer()), name: outputs[0].name.replace(/\.pdf$/, "") };
  } finally {
    C.busy = false;
    cRefresh();
  }
}

wireDrop("c", "cFile");
$("cAdd").addEventListener("click", () => $("cFile").click());
$("cFile").addEventListener("change", e => { cAdd(e.target.files); e.target.value = ""; });
$("cGo").addEventListener("click", cConvert);
$("cWork").addEventListener("change", e => { if (e.target.name) cRefresh(); });
$("cReset").addEventListener("click", () => { if (C.busy) return; C.items.clear(); cList.replaceChildren(); setMsg($("cMsg"), ""); dzError("c", ""); cRefresh(); });
new Sortable(cList, { handle: ".grip", animation: 150, ghostClass: "ghost", forceFallback: true, fallbackClass: "dragging", fallbackOnBody: true });

/* ---------- Envoi d'un outil à l'autre ---------- */
// Chaque outil fournit son résultat (pages choisies et réordonnées, fusion, annotations) sans le télécharger.
// L'outil de départ garde son état : on peut y revenir et continuer.
const TOOL_NAMES = { extract: "Extraire", merge: "Fusionner", convert: "Convertisseur", markdown: "PDF → Markdown", viewer: "Visionneuse" };
const SOURCES = {
  extract: {
    msg: "xMsg",
    ready: () => !!X.src && xChecked().length > 0,
    build: async () => {
      const list = xChecked().map(el => +el.dataset.page - 1);
      return { bytes: await xBuild(list), name: xBaseName(list) };
    },
  },
  merge: {
    msg: "mMsg",
    ready: () => M.items.size >= 2 && !M.busy,
    build: async () => {
      M.busy = true;
      try { return { bytes: await mBuild(mOrdered(), s => setMsg($("mMsg"), s)), name: "fusion" }; }
      finally { M.busy = false; mRefresh(); }
    },
  },
  convert: {
    msg: "cMsg",
    ready: () => !C.busy && cSinglePdf(),
    build: cBuildPdf,
  },
  viewer: {
    msg: "vMsg",
    ready: () => !!V.doc,
    build: async () => ({ ...(await viewerBuild()), name: V.name + "_annoté" }),
  },
};
const TARGET_MSG = { extract: "xMsg", merge: "mMsg", convert: "cMsg", markdown: "mdMsg", viewer: "vMsg" };

function sendRefresh() {
  document.querySelectorAll(".send").forEach(box => {
    const ok = SOURCES[box.dataset.from].ready();
    box.querySelectorAll("button").forEach(b => { b.disabled = !ok; });
  });
}

async function sendTo(from, to) {
  const src = SOURCES[from];
  if (!src.ready()) return;
  if (to === "extract" && X.src && !confirm("Remplacer le fichier ouvert dans Extraire ?")) return;
  if (to === "viewer" && V.dirty && !confirm("Les annotations non téléchargées de la visionneuse seront perdues. Continuer ?")) return;
  document.querySelectorAll(`.send[data-from="${from}"] button`).forEach(b => { b.disabled = true; });
  setMsg($(src.msg), "Préparation…");
  try {
    const { bytes, name, failed } = await src.build();
    const file = new File([bytes], name + ".pdf", { type: "application/pdf" });
    setMsg($(src.msg), `Envoyé vers ${TOOL_NAMES[to]} : ${file.name}`
      + (failed && failed.length ? ` · champs non repris : ${failed.join(", ")}` : ""), failed && failed.length ? "error" : "ok");
    go(to);
    if (to === "extract") await xOpen([file]);
    else if (to === "merge") await mAdd([file]);
    else if (to === "convert") await cAdd([file]);
    else if (to === "markdown") mdAddFiles([file]);
    else { V.dirty = false; await viewerOpen(file); }
    const msg = $(TARGET_MSG[to]);
    if (!msg.textContent) setMsg(msg, `Reçu depuis ${TOOL_NAMES[from]} : ${file.name}`, "ok");
  } catch (e) {
    setMsg($(src.msg), "Erreur : " + e.message, "error");
  } finally {
    sendRefresh();
  }
}

document.querySelectorAll(".send").forEach(box => box.addEventListener("click", e => {
  const b = e.target.closest("button[data-to]");
  if (b) sendTo(box.dataset.from, b.dataset.to);
}));

/* ---------- Dépôt de fichiers n'importe où sur la page ---------- */
// Le glisser des vignettes et des cartes est ignoré. Sur l'accueil : un PDF ouvre Extraire, plusieurs ouvrent Fusionner,
// et dès qu'il y a une image, tout va au Convertisseur.
const isFileDrag = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
document.addEventListener("dragover", e => { if (isFileDrag(e)) { e.preventDefault(); document.body.classList.add("dragging"); } });
document.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
document.addEventListener("drop", e => {
  document.body.classList.remove("dragging");
  if (!isFileDrag(e)) return;
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (view === "extract") xOpen(files);
  else if (view === "merge") mAdd(files);
  else if (view === "convert") cAdd(files);
  else if (view === "markdown") mdAddFiles(files);
  else if (view === "viewer") viewerOpen(files[0]);
  else if ([...files].some(f => !isPdf(f) && isImageName(f))) { go("convert"); cAdd(files); }
  else {
    const pdfs = [...files].filter(isPdf);
    if (pdfs.length > 1) { go("merge"); mAdd(pdfs); }
    else if (pdfs.length) { go("extract"); xOpen(pdfs); }
  }
});

/* ---------- PDF → Markdown ---------- */
const mdFiles = [];      // { file, name, state, text, row }
let mdCurrent = null, mdRunning = false;

const BULLET = /^\s*([•●▪■◦○·–—➢►✓\-*])(\s+|$)/;
const escapeMd = s => s.replace(/([*_`\\])/g, "\\$1");

function mdMsg(text, kind = "") { setMsg($("mdMsg"), text, kind); }

// Une page -> lignes { text (Markdown), plain, x, y, size, bold, bullet }
async function pageLines(page) {
  const tc = await page.getTextContent();
  // Le nom réel des polices (…-Bold, …-Italic) n'est connu qu'après chargement des ressources
  try { await page.getOperatorList(); } catch (e) {}
  const styleCache = {};
  const styleOf = fontName => {
    if (!(fontName in styleCache)) {
      let bold = false, italic = false;
      try {
        const f = page.commonObjs.get(fontName);
        const n = (f && f.name) || "";
        bold = !!(f && f.bold) || /bold|black|heavy|semibold|demi/i.test(n);
        italic = !!(f && f.italic) || /italic|oblique/i.test(n);
      } catch (e) {}
      styleCache[fontName] = { bold, italic };
    }
    return styleCache[fontName];
  };

  const items = tc.items
    .filter(it => typeof it.str === "string" && it.str.length)
    .map(it => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
      size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
      ...styleOf(it.fontName),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const groups = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.y - it.y) <= Math.max(g.size, it.size) * 0.5) {
      g.items.push(it); g.size = Math.max(g.size, it.size);
    } else groups.push({ y: it.y, size: it.size, items: [it] });
  }

  return groups.map(g => {
    const its = g.items.sort((a, b) => a.x - b.x);
    // Puce en début de ligne : on la retire, la ligne devient un élément de liste
    let bullet = false;
    const first = its.find(i => i.str.trim());
    const m = first && first.str.match(BULLET);
    if (m && (first.str.length > m[0].length || its.length > 1)) {
      bullet = true;
      first.str = first.str.slice(m[0].length);
    }
    // Segments de même style ; les espaces seuls prennent le style courant
    const segs = [];
    let prev = null;
    for (const it of its) {
      let s = it.str;
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        if (gap > prev.size * 0.2 && !/\s$/.test(prev.str) && !/^\s/.test(s)) s = " " + s;
      }
      prev = it;
      const last = segs[segs.length - 1];
      if (last && (!s.trim() || (last.bold === it.bold && last.italic === it.italic))) last.s += s;
      else segs.push({ s, bold: it.bold, italic: it.italic });
    }
    const plain = segs.map(x => x.s).join("").replace(/\s+/g, " ").trim();
    const visible = segs.filter(x => x.s.trim());
    const allBold = visible.length > 0 && visible.every(x => x.bold);
    const text = segs.map(x => {
      const core = x.s.trim();
      if (!core) return x.s;
      const lead = x.s.match(/^\s*/)[0], trail = x.s.match(/\s*$/)[0];
      let t = escapeMd(core);
      if (x.bold && !allBold) t = `**${t}**`;
      if (x.italic) t = `*${t}*`;
      return lead + t + trail;
    }).join("").replace(/\s+/g, " ").trim();
    return { text, plain, x: its[0].x, y: g.y, size: g.size, bold: allBold, bullet };
  }).filter(l => l.plain);
}

// Un seul worker OCR pour tous les outils : chacun le réserve (ocrHold) et le libère ; il est arrêté au dernier départ
let ocrWorker = null, ocrUsers = 0;
const ocrHold = () => { ocrUsers++; };
async function ocrRelease() {
  if (--ocrUsers > 0 || !ocrWorker) return;
  const w = ocrWorker;
  ocrWorker = null;
  try { (await w).terminate(); } catch (e) { /* worker jamais démarré */ }
}

function loadOcr() {
  ocrWorker ??= startOcr().catch(e => { ocrWorker = null; throw e; });
  return ocrWorker;
}
async function startOcr() {
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.integrity = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";
      s.crossOrigin = "anonymous";
      s.onload = res;
      s.onerror = () => rej(new Error("impossible de charger l'OCR"));
      document.head.append(s);
    });
  }
  const workerPath = await verifiedScriptUrl(
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    "sha384-zxn+VqofFzXpH99dUb3fa4ywoSBQJPy6/6oEaJHPlblZXr53a0g1Jl6720vgSzB7",
  );
  // Noyau épinglé sur la version autorisée par la CSP
  return Tesseract.createWorker("fra+eng", 1, {
    workerPath, workerBlobURL: false, corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
  });
}

// Page scannée : rendu en image puis reconnaissance de caractères -> paragraphes
async function ocrPage(page) {
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3, 2000 / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  // Rendu « impression » : il continue quand l'onglet passe en arrière-plan
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, intent: "print" }).promise;
  return ocrParagraphs(canvas);
}

async function ocrParagraphs(canvas) {
  const { data } = await (await loadOcr()).recognize(canvas);
  return data.text.split(/\n\s*\n/)
    .map(p => p.replace(/(\p{L})-\n(?=\p{Ll})/gu, "$1").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function joinText(a, b) {
  if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return a + " " + b;
}

function buildMarkdown(pagesData) {
  const textPages = pagesData.filter(p => p.lines);
  const norm = s => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

  // En-têtes et pieds de page répétés d'une page à l'autre
  const repeated = new Set();
  if (textPages.length >= 3) {
    const counts = new Map();
    for (const p of textPages) {
      new Set([...p.lines.slice(0, 2), ...p.lines.slice(-2)].map(l => norm(l.plain)))
        .forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
    }
    counts.forEach((c, k) => { if (k && c >= Math.max(3, textPages.length * 0.6)) repeated.add(k); });
  }
  const pageNum = /^[-–\s]*(page\s*)?#(\s*(\/|sur|of)\s*#)?[-–\s]*$/;
  const isNoise = (l, i, n) => {
    const edge = i < 2 || i >= n - 2;
    const k = norm(l.plain);
    return edge && (repeated.has(k) || pageNum.test(k));
  };

  // Taille du corps de texte = taille la plus répandue (pondérée par le nombre de caractères)
  const bySize = new Map();
  textPages.forEach(p => p.lines.forEach(l => {
    const s = Math.round(l.size * 2) / 2;
    bySize.set(s, (bySize.get(s) || 0) + l.plain.length);
  }));
  let body = 10, best = -1;
  bySize.forEach((c, s) => { if (c > best) { best = c; body = s; } });
  const headingSizes = [...bySize.keys()].filter(s => s >= body * 1.15).sort((a, b) => b - a);
  const levelOf = size => {
    const i = headingSizes.indexOf(Math.round(size * 2) / 2);
    return i < 0 ? 0 : Math.min(i + 1, 3);
  };
  const boldLevel = Math.min(Math.max(Math.min(headingSizes.length, 3) + 1, 2), 4);

  const blocks = [];
  pagesData.forEach((p, pageIndex) => {
    if (p.ocr) { p.ocr.forEach(t => blocks.push({ type: "p", text: escapeMd(t), page: pageIndex })); return; }
    let firstOnPage = true;
    p.lines.forEach((l, i) => {
      if (isNoise(l, i, p.lines.length)) return;
      const prev = blocks[blocks.length - 1];
      const samePage = prev && prev.page === pageIndex;
      const gapOk = samePage && prev.y - l.y <= l.size * 1.9;
      const level = l.plain.length < 150 && !l.bullet ? levelOf(l.size) : 0;
      const boldHeading = !level && l.bold && !l.bullet && l.plain.length < 100 && !/[.,;:]$/.test(l.plain)
        && !(gapOk && prev.type === "p" && !/[.!?:]$/.test(prev.plain));

      if (level || boldHeading) {
        const lv = level || boldLevel;
        const plain = l.plain;
        if (prev && prev.type === "h" && prev.level === lv && gapOk) { prev.text += " " + plain; prev.y = l.y; }
        else blocks.push({ type: "h", level: lv, text: plain, y: l.y, page: pageIndex });
      } else if (l.bullet || /^\d{1,3}[.)]\s/.test(l.plain)) {
        blocks.push({ type: "li", bullet: l.bullet, text: l.text, plain: l.plain, x: l.x, y: l.y, page: pageIndex });
      } else if (prev && (prev.type === "p" || prev.type === "li") && gapOk
                 && !(prev.type === "li" && l.x <= prev.x - l.size * 0.5)) {
        prev.text = joinText(prev.text, l.text); prev.plain = joinText(prev.plain, l.plain); prev.y = l.y;
      } else if (firstOnPage && prev && prev.type === "p" && prev.page === pageIndex - 1
                 && !/[.!?:;»"”)]$/.test(prev.plain) && /^\p{Ll}/u.test(l.plain)) {
        // Paragraphe coupé par un changement de page
        prev.text = joinText(prev.text, l.text); prev.plain = joinText(prev.plain, l.plain);
        prev.y = l.y; prev.page = pageIndex;
      } else {
        blocks.push({ type: "p", text: l.text, plain: l.plain, x: l.x, y: l.y, page: pageIndex });
      }
      firstOnPage = false;
    });
  });

  let out = "";
  blocks.forEach((b, i) => {
    let s;
    if (b.type === "h") s = "#".repeat(b.level) + " " + b.text;
    else if (b.type === "li") s = (b.bullet ? "- " : "") + b.text;
    else s = b.text.replace(/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/, "\\$1");
    const prev = blocks[i - 1];
    out += i === 0 ? s : (prev.type === "li" && b.type === "li" ? "\n" : "\n\n") + s;
  });
  return out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Photo ou image de document : lue directement par OCR
async function imageToMarkdown(file, progress) {
  progress("lecture de l'image");
  const bm = await loadImage(file);
  const c = renderImage(bm, { maxSide: 2500, background: "#fff" });
  bm.close();
  try {
    progress("OCR de l'image");
    return { text: buildMarkdown([{ ocr: await ocrParagraphs(c) }]), pages: 1, ocrCount: 1 };
  } finally {
    freeCanvas(c);
  }
}

async function pdfToMarkdown(file, progress) {
  if (!isPdf(file)) return imageToMarkdown(file, progress);
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const pagesData = [];
  let ocrCount = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      progress(`page ${n} / ${doc.numPages}`);
      const page = await doc.getPage(n);
      const lines = await pageLines(page);
      const chars = lines.reduce((s, l) => s + l.plain.replace(/\s/g, "").length, 0);
      if (chars < 20 && $("mdOcr").checked) {
        progress(`OCR page ${n} / ${doc.numPages}`);
        pagesData.push({ ocr: await ocrPage(page) });
        ocrCount++;
      } else {
        pagesData.push({ lines });
      }
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }
  return { text: buildMarkdown(pagesData), pages: pagesData.length, ocrCount };
}

function mdRow(entry) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="md-state">${icon("markdown")}</span>
    <div class="fmeta"><div class="fname body"></div><div class="fsub small"></div><span class="prog" hidden><i></i></span></div>
    <span class="fbtns"><button type="button" class="btn btn-sm" data-act="view" disabled>Aperçu</button><button type="button" class="btn btn-sm" data-act="save" disabled>Télécharger</button></span>`;
  li.querySelector(".fname").textContent = entry.file.name;
  li.querySelector('[data-act="view"]').addEventListener("click", () => mdShow(entry));
  li.querySelector('[data-act="save"]').addEventListener("click", () => mdSave(entry));
  return li;
}

function mdSetState(entry, state, detail) {
  entry.state = state;
  const li = entry.row;
  li.className = `fcard ${state}` + (entry === mdCurrent ? " current" : "");
  li.querySelector(".md-state").innerHTML = icon({ ok: "check", erreur: "x" }[state] || "markdown");
  const sub = li.querySelector(".fsub");
  sub.textContent = detail;
  sub.className = "fsub small" + ({ ok: " ok", erreur: " error" }[state] || "");
  // Progression « page n / total » pendant la conversion
  const m = state === "encours" && detail.match(/(\d+) \/ (\d+)/);
  li.querySelector(".prog").hidden = !m;
  if (m) li.querySelector(".prog i").style.width = (100 * (m[1] - 1) / m[2]) + "%";
  li.querySelectorAll("button").forEach(b => { b.disabled = state !== "ok"; });
}

function mdRefresh() {
  const done = mdFiles.filter(e => e.state === "ok").length;
  $("mdZip").hidden = done < 2;
  $("mdReset").hidden = mdFiles.length === 0;
  $("mdDropTitle").textContent = mdFiles.length ? "Déposez d'autres fichiers ici" : "Déposez vos PDF ou images ici";
}

function mdShow(entry) {
  mdCurrent = entry;
  mdFiles.forEach(e => e.row.classList.toggle("current", e === entry));
  $("mdPreviewName").textContent = entry.name + ".md";
  $("mdPreview").value = entry.text;
  $("mdPreviewWrap").hidden = false;
}

async function mdSave(entry) {
  const saved = await saveBlob(new Blob([entry.text], { type: "text/markdown" }), entry.name + ".md", "text/markdown", "md");
  if (saved) mdMsg(`Enregistré : ${saved}`, "ok");
}

function mdAddFiles(list) {
  const files = [...list].filter(f => isPdf(f) || isImageName(f));
  if (!files.length) { dzError("md", "Aucun PDF ni image JPG, PNG, WebP ou HEIC parmi les fichiers déposés."); return; }
  dzError("md", "");
  mdMsg("");
  for (const file of files) {
    const entry = { file, name: file.name.replace(/\.(pdf|jpe?g|png|webp|hei[cf])$/i, ""), state: "attente", text: null };
    entry.row = mdRow(entry);
    $("mdList").append(entry.row);
    mdFiles.push(entry);
    mdSetState(entry, "attente", "en attente");
  }
  mdRefresh();
  mdRun();
}

// Un fichier à la fois, comme sur le Pi : l'OCR est gourmand
async function mdRun() {
  if (mdRunning) return;
  mdRunning = true;
  ocrHold();
  let entry;
  while ((entry = mdFiles.find(e => e.state === "attente"))) {
    const e = entry;
    mdSetState(e, "encours", "lecture…");
    try {
      const r = await pdfToMarkdown(e.file, s => mdSetState(e, "encours", s));
      e.text = r.text;
      const words = (r.text.match(/\p{L}+/gu) || []).length;
      mdSetState(e, "ok", `Prêt · ${r.pages} p. · ${words} mots${r.ocrCount ? ` · OCR sur ${r.ocrCount} p.` : ""}`);
      if (!mdCurrent || !mdFiles.includes(mdCurrent)) mdShow(e);
    } catch (err) {
      mdSetState(e, "erreur", err.message || "échec");
    }
    mdRefresh();
  }
  await ocrRelease();
  mdRunning = false;
}

const mdPick = () => $("mdFile").click();
wireDrop("md", "mdFile");
$("mdFile").addEventListener("change", e => { mdAddFiles(e.target.files); e.target.value = ""; });
$("mdSave").addEventListener("click", () => mdCurrent && mdSave(mdCurrent));
$("mdCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("mdPreview").value); }
  catch (e) { $("mdPreview").select(); document.execCommand("copy"); }
  $("mdCopy").textContent = "Copié";
  setTimeout(() => { $("mdCopy").textContent = "Copier"; }, 1500);
});
$("mdZip").addEventListener("click", async () => {
  const zip = new JSZip(), used = new Set();
  mdFiles.filter(e => e.state === "ok").forEach(e => {
    let n = e.name + ".md", i = 2;
    while (used.has(n)) n = `${e.name} (${i++}).md`;
    used.add(n); zip.file(n, e.text);
  });
  const saved = await saveBlob(await zip.generateAsync({ type: "blob" }), "markdown.zip", "application/zip", "zip");
  if (saved) mdMsg(`Enregistré : ${saved}`, "ok");
});
$("mdReset").addEventListener("click", () => {
  if (mdRunning) { mdMsg("Attendez la fin de la conversion en cours.", "error"); return; }
  mdFiles.length = 0; mdCurrent = null;
  $("mdList").replaceChildren(); $("mdPreviewWrap").hidden = true; mdMsg("");
  mdRefresh();
});

/* ---------- Visionneuse ---------- */
// Annotations stockées en coordonnées PDF (points, origine en bas à gauche) :
//   highlight { rect:[x1,y1,x2,y2] } · ink { points:[[x,y]…], width } · text { x, y (haut), size, text } · note { x, y, text }
const NS = "http://www.w3.org/2000/svg";
const V = {
  doc: null, bytes: null, name: "", pages: [], scale: 1, tool: "select",
  colors: { highlight: "#ffd400", pen: "#e5322d", text: "#111111", note: "#ffd400" },
  annots: [], nextId: 1, undo: [], selected: null, dirty: false,
  fields: new Map(), changedFields: new Set(),
};
const PALETTE = ["#ffd400", "#5fd35f", "#ff7eb6", "#4fa3ff", "#e5322d", "#111111"];
const COLOR_KEY = { highlight: "highlight", ink: "pen", text: "text", note: "note" };
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function vMsg(text, kind = "") { setMsg($("vMsg"), text, kind); }
const snapshot = () => JSON.stringify(V.annots);
const findAnnot = id => V.annots.find(a => a.id === id);
function pushUndo(before = snapshot()) {
  V.undo.push(before);
  if (V.undo.length > 100) V.undo.shift();
  V.dirty = true;
}
function svgEl(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function viewRect(p, [x1, y1, x2, y2]) {
  const [ax, ay] = p.viewport.convertToViewportPoint(x1, y1);
  const [bx, by] = p.viewport.convertToViewportPoint(x2, y2);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}
function localPoint(p, ev) {
  const r = p.el.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top];
}

/* Ouverture et affichage */
const vObserver = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) renderVPage(V.pages[+e.target.dataset.index]);
}, { rootMargin: "800px 0px" });

function viewerClose() {
  V.pages.forEach(p => { vObserver.unobserve(p.el); if (p.task) p.task.cancel(); });
  if (V.doc) V.doc.destroy();
  V.pages = []; V.doc = null;
  $("vPages").replaceChildren();
}

async function viewerOpen(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { vMsg("Ce fichier n'est pas un PDF.", "error"); return; }
  if (V.dirty && !confirm("Les modifications non téléchargées seront perdues. Ouvrir quand même ?")) return;
  vMsg("Ouverture…");
  let doc, bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    doc = await openPdf(bytes.slice());
  } catch (e) {
    vMsg("Impossible d'ouvrir le PDF : " + e.message, "error"); return;
  }
  viewerClose();
  Object.assign(V, {
    doc, bytes, name: file.name.replace(/\.pdf$/i, ""), annots: [], undo: [], selected: null, dirty: false,
    fields: new Map(), changedFields: new Set(),
  });
  let fieldCount = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const el = document.createElement("div");
    el.className = "vpage";
    el.dataset.index = n - 1;
    el.innerHTML = `<canvas></canvas><svg class="vsvg"></svg><div class="vhtml"></div>`;
    const p = { page, el, index: n - 1, canvas: el.querySelector("canvas"), svg: el.querySelector("svg"),
                html: el.querySelector(".vhtml"), rendered: 0, task: null, viewport: null, widgets: [] };
    try {
      const anns = await page.getAnnotations();
      p.widgets = anns.filter(a => a.subtype === "Widget" && a.fieldName && !a.hidden).map(makeWidget).filter(Boolean);
      fieldCount += p.widgets.length;
    } catch (e) {}
    el.addEventListener("pointerdown", ev => onPagePointerDown(ev, p));
    V.pages.push(p);
    $("vPages").append(el);
  }
  $("vName").textContent = file.name;
  $("vStart").hidden = true;
  $("viewer").hidden = false;
  sendRefresh();
  setTool("select");
  fitWidth();
  updatePageInfo();
  vMsg(fieldCount ? `Ce PDF contient ${new Set(V.pages.flatMap(p => p.widgets.map(w => w.name))).size} champ(s) à remplir, surlignés en vert.` : "");
}

function setScale(s) {
  V.scale = Math.min(4, Math.max(0.25, s));
  $("vZoom").textContent = Math.round(V.scale * 100) + " %";
  for (const p of V.pages) {
    p.viewport = p.page.getViewport({ scale: V.scale });
    p.el.style.width = p.viewport.width + "px";
    p.el.style.height = p.viewport.height + "px";
    redraw(p);
    p.widgets.forEach(w => placeWidget(p, w));
    vObserver.unobserve(p.el); vObserver.observe(p.el);
  }
}

// Zoom en gardant le même endroit au centre de l'écran
function zoomTo(s) {
  const box = $("vPages");
  const top = box.getBoundingClientRect().top + scrollY;
  const ratio = (scrollY + innerHeight / 2 - top) / box.scrollHeight;
  setScale(s);
  scrollTo(scrollX, top + ratio * box.scrollHeight - innerHeight / 2);
}
function fitWidth() {
  const maxW = Math.max(...V.pages.map(p => p.page.getViewport({ scale: 1 }).width));
  const box = getComputedStyle($("vPages"));
  const avail = $("vPages").clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - 2;
  setScale(avail > 200 ? Math.min(2, avail / maxW) : 1);
}

async function renderVPage(p) {
  if (!p || p.rendered === V.scale) return;
  const scale = V.scale;
  if (p.task) { p.task.cancel(); p.task = null; }
  const vp = p.page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  // Les champs de formulaire ne sont pas peints : on les remplace par de vrais champs HTML
  const task = p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp,
                               annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS });
  p.task = task;
  try { await task.promise; } catch (e) { return; }
  if (p.task !== task || V.scale !== scale) return;
  p.task = null;
  p.rendered = scale;
  p.canvas.replaceWith(canvas);
  p.canvas = canvas;
}

function updatePageInfo() {
  if (!V.pages.length) return;
  let cur = 0;
  V.pages.forEach((p, i) => { if (p.el.getBoundingClientRect().top < innerHeight / 2) cur = i; });
  if (document.activeElement !== $("vPageIn")) $("vPageIn").value = cur + 1;
  $("vPageTotal").textContent = `/ ${V.pages.length}`;
}

/* Formulaires */
function makeWidget(a) {
  let kind;
  if (a.fieldType === "Tx") kind = "text";
  else if (a.fieldType === "Btn" && a.checkBox) kind = "checkbox";
  else if (a.fieldType === "Btn" && a.radioButton) kind = "radio";
  else if (a.fieldType === "Ch") kind = "choice";
  else return null;
  const name = a.fieldName;
  if (!V.fields.has(name)) {
    let value;
    if (kind === "text") value = a.fieldValue || "";
    else if (kind === "checkbox") value = !!a.fieldValue && a.fieldValue !== "Off";
    else if (kind === "radio") value = a.fieldValue && a.fieldValue !== "Off" ? a.fieldValue : "";
    else value = Array.isArray(a.fieldValue) ? (a.fieldValue[0] || "") : (a.fieldValue || "");
    V.fields.set(name, { kind, value });
  }
  return {
    name, kind, rect: a.rect, multiline: !!a.multiLine, readOnly: !!a.readOnly, maxLen: a.maxLen || 0,
    exportValue: a.buttonValue, options: a.options || [], combo: !!a.combo,
    fontSize: (a.defaultAppearanceData && a.defaultAppearanceData.fontSize) || 0, el: null,
  };
}

function syncField(name, from) {
  const f = V.fields.get(name);
  V.changedFields.add(name);
  V.dirty = true;
  for (const p of V.pages) for (const w of p.widgets) {
    if (w.name !== name || !w.el || w.el === from) continue;
    if (w.kind === "checkbox") w.el.checked = f.value;
    else if (w.kind === "radio") w.el.checked = f.value === w.exportValue;
    else w.el.value = f.value;
  }
}

function placeWidget(p, w) {
  const f = V.fields.get(w.name);
  if (!w.el) {
    let el;
    if (w.kind === "text") {
      el = document.createElement(w.multiline ? "textarea" : "input");
      if (!w.multiline) el.type = "text";
      el.value = f.value;
      if (w.maxLen) el.maxLength = w.maxLen;
      el.addEventListener("input", () => { f.value = el.value; syncField(w.name, el); });
    } else if (w.kind === "checkbox" || w.kind === "radio") {
      el = document.createElement("input");
      el.type = w.kind;
      if (w.kind === "radio") el.name = "vradio_" + w.name;
      el.checked = w.kind === "checkbox" ? f.value : f.value === w.exportValue;
      el.addEventListener("change", () => {
        f.value = w.kind === "checkbox" ? el.checked : w.exportValue;
        syncField(w.name, el);
      });
    } else {
      el = document.createElement("select");
      if (!w.options.some(o => o.exportValue === f.value)) el.append(new Option("", ""));
      w.options.forEach(o => el.append(new Option(o.displayValue, o.exportValue)));
      el.value = f.value;
      el.addEventListener("change", () => { f.value = el.value; syncField(w.name, el); });
    }
    el.className = "vfield";
    el.title = w.name;
    el.disabled = w.readOnly;
    el.setAttribute("aria-label", w.name);
    w.el = el;
    p.html.append(el);
  }
  const r = viewRect(p, w.rect);
  const hPt = Math.abs(w.rect[3] - w.rect[1]);
  const size = (w.fontSize || Math.min(12, Math.max(6, hPt * (w.multiline ? 0.5 : 0.7)))) * V.scale;
  Object.assign(w.el.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px", fontSize: size + "px" });
}

/* Dessin des annotations */
function redraw(p) {
  if (!p.viewport) return;
  p.svg.replaceChildren();
  p.html.querySelectorAll(".vtext, .vnote").forEach(n => n.remove());
  for (const a of V.annots) if (a.page === p.index) drawAnnot(p, a);
  updateSelection();
}

function drawAnnot(p, a) {
  if (a.type === "highlight") {
    const r = viewRect(p, a.rect);
    const n = svgEl("rect", { x: r.x, y: r.y, width: r.w, height: r.h, fill: a.color, "fill-opacity": 0.4, style: "mix-blend-mode:multiply" });
    n.dataset.id = a.id; p.svg.append(n);
  } else if (a.type === "ink") {
    const pts = a.points.map(([x, y]) => p.viewport.convertToViewportPoint(x, y).map(v => v.toFixed(1)).join(",")).join(" ");
    const n = svgEl("polyline", { points: pts, fill: "none", stroke: a.color, "stroke-width": a.width * V.scale,
                                  "stroke-linecap": "round", "stroke-linejoin": "round" });
    n.dataset.id = a.id; p.svg.append(n);
  } else if (a.type === "text") {
    p.html.append(textBox(p, a));
  } else if (a.type === "note") {
    const n = document.createElement("div");
    n.className = "vnote";
    n.dataset.id = a.id;
    n.innerHTML = icon("note");
    n.title = a.text || "Note";
    n.style.background = a.color;
    const [x, y] = p.viewport.convertToViewportPoint(a.x, a.y);
    Object.assign(n.style, { left: x + "px", top: y + "px" });
    p.html.append(n);
  }
}

function textBox(p, a) {
  const el = document.createElement("div");
  el.className = "vtext";
  el.dataset.id = a.id;
  try { el.contentEditable = "plaintext-only"; } catch (e) { el.contentEditable = "true"; }
  el.spellcheck = false;
  el.textContent = a.text;
  const [x, y] = p.viewport.convertToViewportPoint(a.x, a.y);
  Object.assign(el.style, { left: x + "px", top: y + "px", fontSize: a.size * V.scale + "px", color: a.color });
  el.addEventListener("focus", () => { if (el._before === undefined) el._before = snapshot(); });
  el.addEventListener("input", () => { a.text = el.innerText.replace(/\n$/, ""); V.dirty = true; });
  el.addEventListener("blur", () => {
    const before = el._before;
    el._before = undefined;
    if (!a.text.trim()) {
      V.annots = V.annots.filter(x => x !== a);
      if (V.selected === a) select(null);
      el.remove();
    } else if (before !== undefined && before !== snapshot()) pushUndo(before);
  });
  el.addEventListener("dblclick", () => el.focus());
  return el;
}

function select(a) {
  V.selected = a;
  $("vDelete").disabled = !a;
  updateSelection();
  renderSwatches();
}

function updateSelection() {
  document.querySelectorAll("#vPages .vsel").forEach(n => n.remove());
  document.querySelectorAll("#vPages .selected").forEach(n => n.classList.remove("selected"));
  const a = V.selected;
  const p = a && V.pages[a.page];
  const node = p && p.el.querySelector(`[data-id="${a.id}"]`);
  if (!node) return;
  if (node instanceof SVGElement) {
    const bb = node.getBBox(), pad = 4;
    p.svg.append(svgEl("rect", { class: "vsel", x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad,
                                 fill: "none", stroke: "#1f4a44", "stroke-width": 1.5, "stroke-dasharray": "5 3" }));
  } else node.classList.add("selected");
}

/* Outils */
function setTool(t) {
  V.tool = t;
  document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === t));
  $("vPages").className = "tool-" + t;
  $("vWidth").hidden = t !== "pen";
  $("vSize").hidden = t !== "text";
  if (t !== "select") select(null);
  closeNotePopup();
  renderSwatches();
}

function renderSwatches() {
  const key = V.tool === "select" ? (V.selected && COLOR_KEY[V.selected.type]) : V.tool;
  const box = $("vSwatches");
  box.replaceChildren();
  if (!key) return;
  const current = V.tool === "select" ? V.selected.color : V.colors[key];
  PALETTE.forEach(c => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.style.background = c;
    b.setAttribute("aria-label", "Couleur " + c);
    b.setAttribute("aria-pressed", c === current);
    b.addEventListener("click", () => {
      V.colors[key] = c;
      if (V.tool === "select" && V.selected) {
        pushUndo(); V.selected.color = c; redraw(V.pages[V.selected.page]);
      }
      renderSwatches();
    });
    box.append(b);
  });
}

function addAnnotation(a, before = snapshot()) {
  a.id = V.nextId++;
  V.annots.push(a);
  pushUndo(before);
  redraw(V.pages[a.page]);
  return a;
}

function deleteSelected() {
  const a = V.selected;
  if (!a) return;
  pushUndo();
  V.annots = V.annots.filter(x => x !== a);
  closeNotePopup();
  select(null);
  redraw(V.pages[a.page]);
}

function undo() {
  if (!V.undo.length) { vMsg("Rien à annuler."); return; }
  V.annots = JSON.parse(V.undo.pop());
  V.dirty = true;
  closeNotePopup();
  select(null);
  V.pages.forEach(redraw);
}

function translateAnnot(a, orig, dx, dy) {
  if (a.type === "highlight") a.rect = [orig.rect[0] + dx, orig.rect[1] + dy, orig.rect[2] + dx, orig.rect[3] + dy];
  else if (a.type === "ink") a.points = orig.points.map(([x, y]) => [x + dx, y + dy]);
  else { a.x = orig.x + dx; a.y = orig.y + dy; }
}

function startMove(e, p, a) {
  const sx = e.clientX, sy = e.clientY;
  const before = snapshot();
  const orig = JSON.parse(JSON.stringify(a));
  const [ox, oy] = p.viewport.convertToPdfPoint(0, 0);
  let moved = false;
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    moved = true;
    const [px, py] = p.viewport.convertToPdfPoint(ev.clientX - sx, ev.clientY - sy);
    translateAnnot(a, orig, px - ox, py - oy);
    redraw(p);
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    if (moved) pushUndo(before);
    else if (a.type === "note") openNotePopup(p, a, false);
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
}

function onPagePointerDown(e, p) {
  if (e.button !== 0) return;
  if (e.target.closest(".vfield, .vpop")) return;
  const hit = e.target.closest("[data-id]");
  const hitAnnot = hit && findAnnot(+hit.dataset.id);
  const tool = V.tool;

  if (tool === "select") {
    if (!hitAnnot) { select(null); closeNotePopup(); return; }
    if (hitAnnot.type === "text" && document.activeElement === hit) return;  // édition en cours
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    closeNotePopup();
    select(hitAnnot);
    startMove(e, p, hitAnnot);
    return;
  }

  if (tool === "text") {
    if (hitAnnot && hitAnnot.type === "text") return;  // clic dans une zone existante : on y écrit
    e.preventDefault();
    const before = snapshot();
    const size = +$("vSize").value;
    const [x, y] = p.viewport.convertToPdfPoint(...localPoint(p, e));
    const a = addAnnotation({ type: "text", page: p.index, x, y: y + size * 0.6, size, color: V.colors.text, text: "" }, before);
    V.undo.pop();  // l'annulation n'est enregistrée qu'une fois du texte saisi
    const el = p.html.querySelector(`[data-id="${a.id}"]`);
    el._before = before;
    setTimeout(() => el.focus(), 0);
    return;
  }

  if (tool === "note") {
    e.preventDefault();
    if (hitAnnot && hitAnnot.type === "note") { openNotePopup(p, hitAnnot, false); return; }
    const [lx, ly] = localPoint(p, e);
    const [x, y] = p.viewport.convertToPdfPoint(lx - 12, ly - 12);
    const a = addAnnotation({ type: "note", page: p.index, x, y, color: V.colors.note, text: "" });
    openNotePopup(p, a, true);
    return;
  }

  // Surligner ou dessiner : tracé à la souris, au stylet ou au doigt
  e.preventDefault();
  try { p.el.setPointerCapture(e.pointerId); } catch (err) {}
  const start = localPoint(p, e);
  const color = V.colors[tool];
  let temp, pts = [start];
  if (tool === "highlight") {
    temp = svgEl("rect", { fill: color, "fill-opacity": 0.4, style: "mix-blend-mode:multiply" });
  } else {
    temp = svgEl("polyline", { fill: "none", stroke: color, "stroke-width": +$("vWidth").value * V.scale,
                               "stroke-linecap": "round", "stroke-linejoin": "round" });
  }
  p.svg.append(temp);
  const move = ev => {
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    for (const ce of (evs.length ? evs : [ev])) {
      const pt = localPoint(p, ce);
      if (tool === "highlight") {
        Object.entries({ x: Math.min(start[0], pt[0]), y: Math.min(start[1], pt[1]),
                         width: Math.abs(pt[0] - start[0]), height: Math.abs(pt[1] - start[1]) })
          .forEach(([k, v]) => temp.setAttribute(k, v));
        pts[1] = pt;
      } else {
        const last = pts[pts.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 1.5) pts.push(pt);
      }
    }
    if (tool === "pen") temp.setAttribute("points", pts.map(q => q.join(",")).join(" "));
  };
  const up = () => {
    p.el.removeEventListener("pointermove", move);
    p.el.removeEventListener("pointerup", up);
    p.el.removeEventListener("pointercancel", up);
    temp.remove();
    if (tool === "highlight") {
      const end = pts[1];
      if (!end || Math.abs(end[0] - start[0]) < 4 || Math.abs(end[1] - start[1]) < 4) return;
      const [x1, y1] = p.viewport.convertToPdfPoint(...start);
      const [x2, y2] = p.viewport.convertToPdfPoint(...end);
      addAnnotation({ type: "highlight", page: p.index, color,
                      rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] });
    } else if (pts.length > 1) {
      addAnnotation({ type: "ink", page: p.index, color, width: +$("vWidth").value,
                      points: pts.map(q => p.viewport.convertToPdfPoint(...q)) });
    }
  };
  p.el.addEventListener("pointermove", move);
  p.el.addEventListener("pointerup", up);
  p.el.addEventListener("pointercancel", up);
}

/* Notes */
let notePopup = null;
function closeNotePopup(remove = false) {
  if (!notePopup) return;
  const { el, a, isNew, before } = notePopup;
  notePopup = null;
  el.remove();
  if (remove || !a.text.trim()) {
    V.annots = V.annots.filter(x => x !== a);
    if (isNew) V.undo.pop();          // note jamais remplie : rien à annuler
    else pushUndo(before);
    if (V.selected === a) select(null);
  } else if (!isNew && before !== snapshot()) pushUndo(before);
  const p = V.pages[a.page];
  if (p) redraw(p);
}
function openNotePopup(p, a, isNew) {
  closeNotePopup();
  const el = document.createElement("div");
  el.className = "vpop";
  el.innerHTML = `<textarea class="field" placeholder="Votre commentaire…" aria-label="Commentaire"></textarea>
    <div><button type="button" class="btn btn-sm" data-act="del">Supprimer</button><button type="button" class="btn btn-sm btn-primary" data-act="ok">OK</button></div>`;
  const ta = el.querySelector("textarea");
  ta.value = a.text;
  ta.addEventListener("input", () => { a.text = ta.value; V.dirty = true; });
  ta.addEventListener("keydown", ev => { if (ev.key === "Escape") closeNotePopup(); });
  ta.addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) closeNotePopup(); });
  el.querySelector('[data-act="ok"]').addEventListener("click", () => closeNotePopup());
  el.querySelector('[data-act="del"]').addEventListener("click", () => closeNotePopup(true));
  const [x, y] = p.viewport.convertToViewportPoint(a.x, a.y);
  const left = Math.min(x + 30, p.viewport.width - 250);
  const top = Math.min(y, p.viewport.height - 150);
  Object.assign(el.style, { left: Math.max(0, left) + "px", top: Math.max(0, top) + "px" });
  p.html.append(el);
  notePopup = { el, a, isNew, before: snapshot() };
  setTimeout(() => ta.focus(), 0);
}

/* Enregistrement */
// PDF d'origine + champs remplis + annotations : ce qui est téléchargé ou envoyé à un autre outil
async function viewerBuild() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  closeNotePopup();
  const { PDFName, PDFArray, PDFHexString, PDFString, PDFBool, StandardFonts } = PDFLib;
  const out = await PDFDocument.load(V.bytes, { ignoreEncryption: true });
  const ctx = out.context;
  const failed = [];

  if (V.changedFields.size) {
    const form = out.getForm();
    for (const name of V.changedFields) {
      const f = V.fields.get(name);
      try {
        const field = form.getField(name);
        if (f.kind === "text") field.setText(f.value);
        else if (f.kind === "checkbox") f.value ? field.check() : field.uncheck();
        else if (f.value) field.select(f.value);
      } catch (e) { failed.push(name); }
    }
  }

  const font = await out.embedFont(StandardFonts.Helvetica);
  const allowed = new Set(font.getCharacterSet());
  const safe = s => [...s].map(c => allowed.has(c.codePointAt(0)) ? c : "?").join("");
  const n3 = v => +v.toFixed(3);
  const rgbOf = c => [1, 3, 5].map(i => n3(parseInt(c.slice(i, i + 2), 16) / 255));
  const pages = out.getPages();
  const attach = (page, dict) => {
    const ref = ctx.register(ctx.obj(dict));
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (annots) annots.push(ref);
    else page.node.set(PDFName.of("Annots"), ctx.obj([ref]));
  };

  for (const a of V.annots) {
    const page = pages[a.page];
    if (!page) continue;
    const [r, g, b] = rgbOf(a.color);
    const common = { Type: "Annot", C: [r, g, b], M: PDFString.fromDate(new Date()), NM: PDFHexString.fromText(`outils-pdf-${a.id}`) };
    if (a.type === "highlight") {
      const [x1, y1, x2, y2] = a.rect.map(n3);
      const w = n3(x2 - x1), h = n3(y2 - y1);
      const ap = ctx.register(ctx.stream(`/GS0 gs ${r} ${g} ${b} rg 0 0 ${w} ${h} re f`, {
        Type: "XObject", Subtype: "Form", BBox: [0, 0, w, h],
        Resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", ca: 0.4, CA: 0.4 } } },
      }));
      attach(page, { ...common, Subtype: "Highlight", F: 4, Rect: [x1, y1, x2, y2],
                     QuadPoints: [x1, y2, x2, y2, x1, y1, x2, y1], CA: 0.4, AP: { N: ap } });
    } else if (a.type === "ink") {
      const pad = a.width;
      const xs = a.points.map(q => q[0]), ys = a.points.map(q => q[1]);
      const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
      const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
      const path = a.points.map(([x, y], i) => `${n3(x - minX)} ${n3(y - minY)} ${i ? "l" : "m"}`).join(" ");
      const ap = ctx.register(ctx.stream(`${r} ${g} ${b} RG ${a.width} w 1 J 1 j ${path} S`, {
        Type: "XObject", Subtype: "Form", BBox: [0, 0, n3(maxX - minX), n3(maxY - minY)],
      }));
      attach(page, { ...common, Subtype: "Ink", F: 4, Rect: [minX, minY, maxX, maxY].map(n3),
                     InkList: [a.points.flat().map(n3)], BS: { W: a.width }, AP: { N: ap } });
    } else if (a.type === "note") {
      attach(page, { ...common, Subtype: "Text", F: 28, Rect: [a.x, a.y - 20, a.x + 20, a.y].map(n3),
                     Contents: PDFHexString.fromText(a.text), Name: "Comment", Open: false });
    } else if (a.type === "text") {
      // Le texte ajouté est inscrit dans la page, comme sur un formulaire papier
      a.text.split("\n").forEach((line, i) => {
        if (line) page.drawText(safe(line), { x: a.x, y: a.y - a.size * (0.95 + 1.2 * i), size: a.size, font,
                                              color: PDFLib.rgb(r, g, b) });
      });
    }
  }

  let bytes;
  try {
    bytes = await out.save();
  } catch (e) {
    // Caractères non pris en charge par la police d'un champ : on laisse le lecteur PDF dessiner les champs
    out.getForm().acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
    bytes = await out.save({ updateFieldAppearances: false });
  }
  return { bytes, failed };
}

async function viewerSave() {
  if (!V.doc) return;
  $("vSave").disabled = true;
  vMsg("Préparation…");
  try {
    const { bytes, failed } = await viewerBuild();
    const saved = await saveBlob(new Blob([bytes], { type: "application/pdf" }), `${V.name}_annoté.pdf`, "application/pdf", "pdf");
    if (saved) {
      V.dirty = false;
      vMsg(`Enregistré : ${saved}` + (failed.length ? ` · champs non enregistrés : ${failed.join(", ")}` : ""), failed.length ? "error" : "ok");
    } else vMsg("Enregistrement annulé.");
  } catch (e) {
    vMsg("Erreur : " + e.message, "error");
  } finally {
    $("vSave").disabled = false;
  }
}

/* Branchements */
const vPick = () => $("vFile").click();
wireDrop("v", "vFile");
$("vPageIn").addEventListener("keydown", e => {
  if (e.key !== "Enter" || !V.pages.length) return;
  const n = Math.min(V.pages.length, Math.max(1, parseInt($("vPageIn").value, 10) || 1));
  V.pages[n - 1].el.scrollIntoView({ block: "start" });
  $("vPageIn").blur();
});
$("vPageIn").addEventListener("blur", updatePageInfo);
$("vOpen").addEventListener("click", vPick);
$("vFile").addEventListener("change", e => { viewerOpen(e.target.files[0]); e.target.value = ""; });
document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => setTool(b.dataset.tool)));
$("vUndo").addEventListener("click", undo);
$("vDelete").addEventListener("click", deleteSelected);
$("vZoomIn").addEventListener("click", () => zoomTo(ZOOMS.find(z => z > V.scale + 0.01) || 4));
$("vZoomOut").addEventListener("click", () => zoomTo([...ZOOMS].reverse().find(z => z < V.scale - 0.01) || 0.25));
$("vFit").addEventListener("click", fitWidth);
$("vSave").addEventListener("click", viewerSave);
$("vPages").addEventListener("wheel", e => {
  if (!e.ctrlKey || !V.pages.length) return;
  e.preventDefault();
  zoomTo(V.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });
let vScrollTimer;
addEventListener("scroll", () => {
  if (activeTab() !== "viewer") return;
  clearTimeout(vScrollTimer);
  vScrollTimer = setTimeout(updatePageInfo, 80);
}, { passive: true });
document.addEventListener("keydown", e => {
  if (activeTab() !== "viewer" || !V.pages.length) return;
  const t = e.target;
  const editing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (e.key === "Escape") {
    if (editing) t.blur();
    else { select(null); setTool("select"); }
    return;
  }
  if (editing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && V.selected) { e.preventDefault(); deleteSelected(); }
});
addEventListener("beforeunload", e => { if (V.dirty) { e.preventDefault(); e.returnValue = ""; } });
