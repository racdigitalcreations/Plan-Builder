// Plan Builder for iPad: a client's own PowerPoint template, filled the way the computer fills it (template_fill.py),
// and reshaped to the other post size the way the computer does it (deck_resize.py).
// The template is the one picked in the client's Brand Kit on the computer ("Make every post look like: My template").

const TEMPLATE = (() => {
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const SLIDE_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  const IMAGE_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
  const SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  const TOKENS = { TITLE: "title", HEADLINE: "title", BODY: "body", EYEBROW: "eyebrow", BUTTON: "button", NUMBER: "num", WEBSITE: "website" };
  const TOKEN_RE = new RegExp("\\{?\\b(" + Object.keys(TOKENS).join("|") + ")\\b\\}?", "g");
  const PHOTO_MIN_AREA = 0.12;
  const COUNTER_RE = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;
  const CONTACT_RE = /@|https?:\/\/|www\.|\.com\b|\.co\b|\.org\b|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
  const EMU_PER_PT = 12700;
  // deck_resize.py
  const SHAPES = { "4:5": 5 / 4, "9:16": 16 / 9 };
  const EDGE = 0.02, TALL_TOP = 0.07, TALL_BOTTOM = 0.17, TALL_RIGHT = 0.09, GROW = 1.12, SHRINK = 0.87, SMALL = 0.12;

  async function zipLib() {                     // loaded only for clients with a template, so the app stays quick
    if (!window.JSZip) {
      await new Promise((done, fail) => {
        const tag = document.createElement("script");
        tag.src = JSZIP; tag.onload = done;
        tag.onerror = () => fail(new Error("Couldn't load the PowerPoint reader. Check the internet connection."));
        document.head.append(tag);
      });
    }
    return window.JSZip;
  }

  // ---------- small XML helpers ----------
  const parse = (text) => new DOMParser().parseFromString(text, "application/xml");
  const xml = (doc) => new XMLSerializer().serializeToString(doc);
  const kids = (el, ns, name) => [...(el ? el.children : [])].filter(c => c.namespaceURI === ns && c.localName === name);
  const kid = (el, ns, name) => kids(el, ns, name)[0] || null;
  const all = (el, ns, name) => el ? [...el.getElementsByTagNameNS(ns, name)] : [];
  const dirOf = (path) => path.slice(0, path.lastIndexOf("/") + 1);
  const relsPathOf = (path) => dirOf(path) + "_rels/" + path.slice(path.lastIndexOf("/") + 1) + ".rels";
  function resolve(base, target) {             // "slides/slide1.xml" from "ppt/" -> "ppt/slides/slide1.xml"
    const parts = (target.startsWith("/") ? target.slice(1) : dirOf(base) + target).split("/"), out = [];
    for (const p of parts) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
    return out.join("/");
  }
  const tag = (el) => el.localName;

  // ---------- shapes (the top-level things on a slide, like python-pptx's slide.shapes) ----------
  function tree(doc) { return all(doc, P, "spTree")[0]; }
  function shapesOf(doc) {
    const t = tree(doc);
    return t ? [...t.children].filter(c => c.namespaceURI === P && ["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(c.localName)) : [];
  }
  function xfrmOf(el) {
    if (tag(el) === "grpSp") return kid(kid(el, P, "grpSpPr"), A, "xfrm");
    if (tag(el) === "graphicFrame") return kid(el, P, "xfrm");
    return kid(kid(el, P, "spPr"), A, "xfrm");
  }
  function box(el) {
    const x = xfrmOf(el), off = x && kid(x, A, "off"), ext = x && kid(x, A, "ext");
    if (!off || !ext) return null;
    return { x: Number(off.getAttribute("x")) || 0, y: Number(off.getAttribute("y")) || 0,
             w: Number(ext.getAttribute("cx")) || 0, h: Number(ext.getAttribute("cy")) || 0 };
  }
  function setBox(el, b) {
    const x = xfrmOf(el), off = x && kid(x, A, "off"), ext = x && kid(x, A, "ext");
    if (!off || !ext) return;
    if (b.x !== undefined) off.setAttribute("x", String(Math.round(b.x)));
    if (b.y !== undefined) off.setAttribute("y", String(Math.round(b.y)));
    if (b.w !== undefined) ext.setAttribute("cx", String(Math.max(1, Math.round(b.w))));
    if (b.h !== undefined) ext.setAttribute("cy", String(Math.max(1, Math.round(b.h))));
  }
  const body = (el) => tag(el) === "sp" ? kid(el, P, "txBody") : null;
  const paras = (el) => kids(body(el), A, "p");
  const runs = (p) => kids(p, A, "r");
  function paraText(p) {
    return [...p.children].map(c => c.namespaceURI !== A ? "" : c.localName === "r" || c.localName === "fld" ? (kid(c, A, "t") || {}).textContent || ""
      : c.localName === "br" ? "\v" : "").join("");
  }
  const text = (el) => body(el) ? paras(el).map(paraText).join("\n") : "";
  function fontSize(el) {
    const sizes = paras(el).flatMap(p => runs(p)).map(r => kid(r, A, "rPr")).filter(Boolean).map(rp => Number(rp.getAttribute("sz")) / 100).filter(Boolean);
    return sizes.length ? Math.max(...sizes) : 18;
  }
  function isCaps(el) {
    const letters = [...text(el)].filter(c => /\p{L}/u.test(c));
    if (!letters.length) return false;
    if (letters.every(c => c === c.toUpperCase() && c !== c.toLowerCase())) return true;
    return paras(el).flatMap(p => runs(p)).some(r => (kid(r, A, "rPr") || { getAttribute: () => "" }).getAttribute("cap") === "all");
  }
  const isPicturePlaceholder = (el) => { const ph = all(el, P, "ph")[0]; return !!ph && ph.getAttribute("type") === "pic"; };
  const solidFill = (el) => !!kid(kid(el, P, "spPr"), A, "solidFill");
  function remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function photoSpots(doc, area) {
    const spots = [];
    for (const el of shapesOf(doc)) {
      const b = box(el);
      const says = body(el) && ["PHOTO", "{PHOTO}", "IMAGE", "{IMAGE}"].includes(text(el).trim().toUpperCase());
      const pic = tag(el) === "pic";
      if (says || (isPicturePlaceholder(el) && b) || (pic && b && b.w * b.h >= PHOTO_MIN_AREA * area)) spots.push(el);
    }
    return spots.sort((p, q) => (Math.floor(box(p).y / 200000) - Math.floor(box(q).y / 200000)) || (box(p).x - box(q).x));
  }
  function tokensIn(doc) {
    const found = new Set();
    for (const el of shapesOf(doc)) for (const m of text(el).matchAll(TOKEN_RE)) found.add(TOKENS[m[1]]);
    return found;
  }

  /** Which box is the title, eyebrow, body, list, button... on a slide with no typed words (template_fill.auto_roles). */
  function autoRoles(doc, W, H) {
    const roles = { counter: [], contact: [], items: [], icons: new Map(), drop: [] };
    const texts = [], fills = [], smallPics = [];
    for (const el of shapesOf(doc)) {
      if (body(el) && text(el).trim()) { texts.push(el); continue; }
      const b = box(el);
      if (!b) continue;
      if (tag(el) === "pic" && b.w * b.h < 0.01 * W * H) smallPics.push(el);
      if (tag(el) === "sp" && solidFill(el) && b.w < W * 0.9 && b.h < H * 0.3) fills.push(el);
    }
    const words = [];
    for (const el of texts) {
      const t = text(el).trim(), letters = [...t].filter(c => /\p{L}/u.test(c)).length, b = box(el) || { x: 0, y: 0, w: 0, h: 0 };
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (COUNTER_RE.test(t)) roles.counter.push(el);
      else if (!letters && /^\d+$/.test(t)) { roles.nums = (roles.nums || []).concat([el]); if (!roles.num) roles.num = el; }
      else if (!letters) { if (/\d/.test(t)) roles.short = (roles.short || []).concat([el]); else roles.quote = el; }
      else if (CONTACT_RE.test(t)) roles.contact.push(el);
      else if (t.split(/\s+/).length === 1 && t.length <= 8 && isCaps(el)) { roles.short = (roles.short || []).concat([el]); /* SWIPE, NEXT...: kept */ }
      else if (fills.map(box).some(f => f.x <= cx && cx <= f.x + f.w && f.y <= cy && cy <= f.y + f.h) && t.length <= 40) roles.button = el;
      else words.push(el);
    }
    if (!words.length) return roles;
    const biggest = Math.max(...words.map(fontSize)), groups = new Map();
    for (const el of words) {
      if (fontSize(el) < biggest && !isCaps(el)) {
        const k = Math.round(fontSize(el)) + "|" + ((box(el) || { w: 0 }).w / W).toFixed(2);
        groups.set(k, (groups.get(k) || []).concat([el]));
      }
    }
    const group = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
    if (group.length >= 2) {
      roles.items = group.slice().sort((p, q) => (Math.round(box(p).y / (H * 0.02)) - Math.round(box(q).y / (H * 0.02))) || (box(p).x - box(q).x));
      for (const item of roles.items) {
        const b = box(item);
        roles.icons.set(item, smallPics.filter(pic => { const c = box(pic);
          return c.x + c.w <= b.x + b.w * 0.05 && b.x - c.x < W * 0.08 && Math.abs((c.y + c.h / 2) - (b.y + b.h / 2)) < Math.max(b.h, c.h); }));
      }
    }
    const rest = words.filter(el => !roles.items.includes(el));
    if (!rest.length) return roles;
    const title = rest.slice().sort((p, q) => (fontSize(q) - fontSize(p)) || (text(q).length - text(p).length))[0];
    roles.title = title;
    rest.splice(rest.indexOf(title), 1);
    const top = (el) => (box(el) || { y: 0 }).y;
    const caps = rest.filter(el => isCaps(el) && fontSize(el) < fontSize(title));
    const above = caps.filter(el => top(el) < top(title)).sort((p, q) => top(q) - top(p));
    const below = caps.filter(el => top(el) >= top(title)).sort((p, q) => top(p) - top(q));
    if (roles.quote && below.length) roles.label = below.shift();
    const order = above.concat(below);
    if (order.length) roles.eyebrow = order.shift();
    roles.drop.push(...order);
    const others = rest.filter(el => !caps.includes(el));
    if (others.length) {
      const b = others.slice().sort((p, q) => text(q).length - text(p).length)[0];
      roles.body = b;
      roles.drop.push(...others.filter(el => el !== b));
    }
    return roles;
  }

  // ---------- filling words ----------
  function parseTitle(t) {
    const parts = [];
    let italic = false;
    for (const piece of String(t || "").split(/(\*)/)) {
      if (piece === "*") italic = !italic;
      else if (piece) parts.push([piece, italic]);
    }
    return parts.length ? parts : [["", false]];
  }
  const plain = (t) => String(t || "").replace(/\*/g, "");
  function setRuns(p, value, italicMarkup) {
    const doc = p.ownerDocument;
    let first = runs(p)[0];
    if (!first) {
      first = doc.createElementNS(A, "a:r");
      first.appendChild(doc.createElementNS(A, "a:t"));
    }
    const model = first.cloneNode(true);
    [...p.children].filter(c => c.namespaceURI === A && ["r", "br", "fld"].includes(c.localName)).forEach(remove);
    const end = kid(p, A, "endParaRPr");
    for (const [part, italic] of (italicMarkup ? parseTitle(value) : [[String(value), false]])) {
      const r = model.cloneNode(true);
      kid(r, A, "t").textContent = part;
      if (italic) {
        let rp = kid(r, A, "rPr");
        if (!rp) { rp = doc.createElementNS(A, "a:rPr"); r.insertBefore(rp, r.firstChild); }
        rp.setAttribute("i", "1");
      }
      p.insertBefore(r, end);
    }
  }
  function fitSize(el, value) {
    const b = box(el);
    if (!b || !b.w || !b.h || !value) return;
    const size = fontSize(el), old = text(el);
    const oldLines = old.split(/[\n\v]/).length;
    const linesAt = (pt) => { const per = Math.max(1, (b.w / EMU_PER_PT) / (pt * 0.52));
      return String(value).split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / per)), 0); };
    const room = Math.max(oldLines, Math.floor((b.h / EMU_PER_PT) / (size * 1.15)), 1);
    let now = size;
    while (linesAt(now) > room && now > size * 0.6) now -= 1;
    if (now < size) {
      const scale = now / size;
      for (const rp of paras(el).flatMap(p => runs(p)).map(r => kid(r, A, "rPr")).filter(Boolean))
        if (rp.getAttribute("sz")) rp.setAttribute("sz", String(Math.round(Number(rp.getAttribute("sz")) * scale)));
    }
  }
  function put(el, value, italicMarkup, fit) {
    const ps = paras(el);
    ps.slice(1).forEach(remove);
    if (fit) fitSize(el, plain(value));
    setRuns(ps[0], String(value), italicMarkup);
  }
  function fillText(doc, values) {
    for (const el of shapesOf(doc)) {
      if (!body(el)) continue;
      const full = text(el).trim(), found = [...full.matchAll(TOKEN_RE)];
      if (!found.length) continue;
      if (found.length === 1 && found[0][0] === full) {           // the whole box is one token
        const key = TOKENS[found[0][1]], value = values[key];
        if (!String(value || "").trim()) { remove(el); continue; }
        paras(el).slice(1).forEach(remove);
        setRuns(paras(el)[0], String(value), key === "title");
        continue;
      }
      for (const p of paras(el)) for (const r of runs(p)) {
        const t = kid(r, A, "t");
        t.textContent = t.textContent.replace(TOKEN_RE, (m, k) => plain(values[TOKENS[k]] || ""));
      }
    }
  }
  function fillAuto(doc, values, W, H, number, total) {
    const roles = autoRoles(doc, W, H);
    for (const el of roles.counter) {
      const old = text(el).trim().match(COUNTER_RE), pad = old[1].length === 2 ? 2 : 1;
      put(el, `${String(number).padStart(pad, "0")} / ${String(total).padStart(pad, "0")}`);
    }
    for (const [key, italic, fit] of [["title", true, true], ["eyebrow", false, false], ["label", false, false], ["body", false, true], ["button", false, true]]) {
      const el = roles[key];
      if (!el) continue;
      let value = values[key];
      if (key === "body" && !value && (values.items || []).length && !roles.items.length) value = values.items.join("  ·  ");
      if (key === "label" && !value) value = roles.eyebrow ? "" : values.eyebrow;
      if (String(value || "").trim()) {
        value = key === "title" ? value : plain(value);
        const original = text(el);
        if (key !== "title" && /\p{L}/u.test(original) && original === original.toUpperCase()) value = value.toUpperCase();
        put(el, value, italic, fit);
      } else if (key !== "button") remove(el);
    }
    // A numbered list (1, 2, 3 beside each item): the numbers stay in order, and rows without an item go,
    // with their extra words (like FREE or $150 for that row)
    if ((roles.nums || []).length > 1 && roles.items.length) roles.num = null;
    if (roles.num) {
      const old = text(roles.num).trim();
      let num = String(values.num || "");
      if (/^\d+$/.test(num) && old.length === 2) num = num.padStart(2, "0");
      if (num) put(roles.num, num); else remove(roles.num);
    }
    if (roles.items.length) {
      let items = (values.items || []).map(plain).filter(i => i.trim());
      if (!items.length && values.body && !roles.body) items = plain(values.body).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
      const row = (el, item) => { const a = box(el), b = box(item); return a && b && Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < Math.max(a.h, b.h); };
      const extras = (roles.short || []).concat((roles.nums || []).length > 1 ? roles.nums : []);
      roles.items.forEach((el, i) => {
        if (i < items.length) { put(el, items[i]); extras.filter(x => row(x, el) && !/^\d+$/.test(text(x).trim())).forEach(remove); }
        else { (roles.icons.get(el) || []).forEach(remove); extras.filter(x => row(x, el)).forEach(remove); remove(el); }
      });
    }
    const contact = String(values.contact || "").trim();
    if (contact) roles.contact.forEach(el => put(el, contact));
    roles.drop.forEach(remove);
  }

  // ---------- the deck ----------
  async function open(bytes) {
    const JSZip = await zipLib();
    const zip = await JSZip.loadAsync(bytes);
    const read = async (path) => { const f = zip.file(path); if (!f) throw new Error("That template isn't a PowerPoint deck the iPad can read (" + path + " is missing)."); return parse(await f.async("string")); };
    const deck = { zip, pres: await read("ppt/presentation.xml"), presRels: await read("ppt/_rels/presentation.xml.rels"),
                   types: await read("[Content_Types].xml"), slides: [], read };
    // A .potx template opens like a normal deck (like potx_to_pptx on the computer)
    for (const o of all(deck.types, "*", "Override")) {
      if (o.getAttribute("PartName") === "/ppt/presentation.xml" && /template\.main\+xml/.test(o.getAttribute("ContentType")))
        o.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml");
    }
    const sz = all(deck.pres, P, "sldSz")[0];
    deck.W = Number(sz.getAttribute("cx")); deck.H = Number(sz.getAttribute("cy"));
    const rels = new Map(all(deck.presRels, REL, "Relationship").map(r => [r.getAttribute("Id"), r]));
    for (const id of all(deck.pres, P, "sldId")) {
      const rel = rels.get(id.getAttributeNS(R, "id"));
      if (!rel) continue;
      const path = resolve("ppt/presentation.xml", rel.getAttribute("Target"));
      const relsPath = relsPathOf(path);
      deck.slides.push({ path, doc: await read(path), rels: zip.file(relsPath) ? await read(relsPath) : parse(`<Relationships xmlns="${REL}"/>`), relsPath, sldId: id, rel });
    }
    if (!deck.slides.length) throw new Error("That template has no slides.");
    return deck;
  }
  function describe(deck) {
    const area = deck.W * deck.H;
    const slides = deck.slides.map(s => {
      const tokens = tokensIn(s.doc), roles = tokens.size ? { items: [] } : autoRoles(s.doc, deck.W, deck.H);
      return { photos: photoSpots(s.doc, area).length, kind: roles.items.length ? "list" : roles.quote ? "quote" : "plain",
               auto: !tokens.size, items: roles.items.length };
    });
    const ratio = deck.H / deck.W;
    return { slides, format: ratio > 1.55 ? "9:16" : ratio > 1.1 ? "4:5" : ratio > 0.9 ? "1:1" : "wide" };
  }
  function chooseSlides(info, plan) {
    const count = info.slides.length, n = plan.length;
    if (count === 1) return plan.map(() => 0);
    const middle = count >= 3 ? [...Array(count - 2).keys()].map(i => i + 1) : [1];
    const order = [];
    let turn = 0;
    plan.forEach((slide, i) => {
      if (i === 0) return order.push(0);
      if (i === n - 1 && count >= 3) return order.push(count - 1);
      const wantsPhoto = !!slide.image;
      const wants = (slide.items || []).length || slide.layout === "checklist" ? "list" : slide.layout === "quote" ? "quote" : "plain";
      let kinds = middle.filter(m => info.slides[m].kind === wants);
      if (!kinds.length && wants !== "plain") kinds = middle.filter(m => info.slides[m].kind === "plain");
      let pool = kinds.length ? kinds : middle;
      if (wants === "list" && (slide.items || []).length) { const roomy = pool.filter(m => info.slides[m].items >= slide.items.length); if (roomy.length) pool = roomy; }
      const fitting = pool.filter(m => (info.slides[m].photos > 0) === wantsPhoto);
      const from = fitting.length ? fitting : pool;
      order.push(from[turn % from.length]);
      turn++;
    });
    return order;
  }
  function nextNumber(deck, prefix) {
    let n = 0;
    deck.zip.forEach((path) => { const m = path.match(new RegExp("^" + prefix + "(\\d+)\\.")); if (m) n = Math.max(n, Number(m[1])); });
    return n + 1;
  }
  /** A copy of a template slide at the end of the deck (pictures, background and all). Same relationship ids, so nothing to renumber. */
  function duplicate(deck, source) {
    const n = deck.nextSlide = Math.max(deck.nextSlide || 0, nextNumber(deck, "ppt/slides/slide") - 1) + 1;   // new slides reach the zip only when saved
    const path = `ppt/slides/slide${n}.xml`, relsPath = relsPathOf(path);
    const doc = parse(xml(source.doc)), rels = parse(xml(source.rels));
    all(rels, REL, "Relationship").filter(r => /\/notesSlide$/.test(r.getAttribute("Type"))).forEach(remove);
    const types = all(deck.types, "http://schemas.openxmlformats.org/package/2006/content-types", "Types")[0];
    const o = deck.types.createElementNS(types.namespaceURI, "Override");
    o.setAttribute("PartName", "/" + path); o.setAttribute("ContentType", SLIDE_CT);
    types.appendChild(o);
    const relRoot = all(deck.presRels, REL, "Relationships")[0];
    const used = new Set(all(deck.presRels, REL, "Relationship").map(r => r.getAttribute("Id")));
    let rid = 1; while (used.has("rId" + rid)) rid++;
    const rel = deck.presRels.createElementNS(REL, "Relationship");
    rel.setAttribute("Id", "rId" + rid); rel.setAttribute("Type", SLIDE_TYPE); rel.setAttribute("Target", `slides/slide${n}.xml`);
    relRoot.appendChild(rel);
    const list = all(deck.pres, P, "sldIdLst")[0];
    const id = deck.pres.createElementNS(P, "p:sldId");
    id.setAttribute("id", String(Math.max(255, ...all(deck.pres, P, "sldId").map(s => Number(s.getAttribute("id")))) + 1));
    id.setAttributeNS(R, "r:id", "rId" + rid);
    list.appendChild(id);
    const made = { path, doc, rels, relsPath, sldId: id, rel };
    deck.slides.push(made);
    return made;
  }
  function dropSlide(deck, slide) {
    remove(slide.sldId); remove(slide.rel);
    for (const r of all(slide.rels, REL, "Relationship").filter(r => /\/notesSlide$/.test(r.getAttribute("Type")))) {
      const notes = resolve(slide.path, r.getAttribute("Target"));
      deck.zip.remove(notes); deck.zip.remove(relsPathOf(notes));
      all(deck.types, "*", "Override").filter(o => o.getAttribute("PartName") === "/" + notes).forEach(remove);
    }
    deck.zip.remove(slide.path); deck.zip.remove(slide.relsPath);
    all(deck.types, "*", "Override").filter(o => o.getAttribute("PartName") === "/" + slide.path).forEach(remove);
    deck.slides.splice(deck.slides.indexOf(slide), 1);
  }

  // ---------- photos ----------
  let mediaCount = 0;
  function ensureJpegType(deck) {
    const types = all(deck.types, "*", "Types")[0];
    if (!all(deck.types, "*", "Default").some(d => (d.getAttribute("Extension") || "").toLowerCase() === "jpeg")) {
      const d = deck.types.createElementNS(types.namespaceURI, "Default");
      d.setAttribute("Extension", "jpeg"); d.setAttribute("ContentType", "image/jpeg");
      types.insertBefore(d, types.firstChild);
    }
  }
  function addImageRel(slide, target) {
    const root = all(slide.rels, REL, "Relationships")[0];
    const used = new Set(all(slide.rels, REL, "Relationship").map(r => r.getAttribute("Id")));
    let n = 1; while (used.has("rId" + n)) n++;
    const rel = slide.rels.createElementNS(REL, "Relationship");
    rel.setAttribute("Id", "rId" + n); rel.setAttribute("Type", IMAGE_TYPE); rel.setAttribute("Target", target);
    root.appendChild(rel);
    return "rId" + n;
  }
  /** Put a photo (a JPEG Blob already cropped to the spot's shape) exactly where the spot is, at the same layer. */
  function placePhoto(deck, slide, spot, jpegBlob, pixels) {
    ensureJpegType(deck);
    const name = `ipad_photo_${Date.now().toString(36)}_${++mediaCount}.jpeg`;
    deck.zip.file("ppt/media/" + name, jpegBlob);
    const rid = addImageRel(slide, "../media/" + name);
    deck.sizes.set("ppt/media/" + name, pixels);
    if (tag(spot) === "pic") {                            // keep the template's picture box: just the new photo in it
      const fill = kid(spot, P, "blipFill"), blip = kid(fill, A, "blip");
      blip.setAttributeNS(R, "r:embed", rid);
      blip.removeAttributeNS(R, "link");
      kids(blip, A, "extLst").forEach(remove);
      kids(fill, A, "srcRect").forEach(remove);
      if (!kid(fill, A, "stretch")) { const st = slide.doc.createElementNS(A, "a:stretch"); st.appendChild(slide.doc.createElementNS(A, "a:fillRect")); fill.appendChild(st); }
      return;
    }
    const b = box(spot);
    const pic = parse(`<p:pic xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:nvPicPr><p:cNvPr id="${9000 + mediaCount}" name="Photo ${mediaCount}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm>`
      + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`).documentElement;
    spot.parentNode.insertBefore(slide.doc.importNode(pic, true), spot);
    remove(spot);
  }

  /**
   * Fill a template with a post's slides. plan: [{title, body, eyebrow, button, num, items, label, layout, image}]
   * image: async (w, h) => {blob, pixels} | null - the slide's photo, cropped to a w x h box.
   * spare: more photo makers for templates with extra photo spots; blank(w, h) the frame for a spot with no photo.
   * -> { blob (the .pptx), notes }
   */
  async function fill(bytes, plan, spare, blank, extras) {
    const deck = await open(bytes);
    deck.sizes = new Map();
    const info = describe(deck), area = deck.W * deck.H;
    const originals = deck.slides.slice(), order = chooseSlides(info, plan), notes = [];
    spare = (spare || []).slice();
    for (let i = 0; i < plan.length; i++) {
      const number = i + 1, index = order[i], slide = duplicate(deck, originals[index]);
      const values = Object.assign({}, plan[i], { website: extras.website || "", contact: extras.contact || "" });
      if (!values.button && extras.button && number === plan.length) values.button = extras.button;
      if (!values.num) values.num = String(number > 1 ? number - 1 : 1);
      if (info.slides[index].auto) fillAuto(slide.doc, values, deck.W, deck.H, number, plan.length);
      else {
        if (!values.body && (values.items || []).length) values.body = values.items.join("  ·  ");
        fillText(slide.doc, values);
      }
      const spots = photoSpots(slide.doc, area), makers = plan[i].image ? [plan[i].image] : [];
      while (makers.length < spots.length && spare.length) makers.push(spare.shift());
      for (let k = 0; k < spots.length; k++) {
        const b = box(spots[k]);
        if (!b || !b.w || !b.h) continue;
        const made = (k < makers.length && await makers[k](b.w, b.h).catch(() => null)) || await blank(b.w, b.h);
        placePhoto(deck, slide, spots[k], made.blob, made.pixels);
      }
      if (spots.length > makers.length) notes.push(`slide ${number} had no photo for ${spots.length - makers.length} spot${spots.length - makers.length > 1 ? "s" : ""}`);
    }
    originals.forEach(s => dropSlide(deck, s));
    return { deck, notes, format: info.format };
  }

  // ---------- the other post shape (deck_resize.convert) ----------
  async function imageSize(deck, path) {
    if (deck.sizes.has(path)) return deck.sizes.get(path);
    try {
      const blob = await deck.zip.file(path).async("blob");
      const bmp = await createImageBitmap(blob);
      const size = [bmp.width, bmp.height];
      deck.sizes.set(path, size);
      return size;
    } catch (e) { deck.sizes.set(path, null); return null; }
  }
  async function recrop(deck, part, pic, newW, newH) {
    const fill = kid(pic, P, "blipFill"), blip = kid(fill, A, "blip");
    const rid = blip && blip.getAttributeNS(R, "embed");
    const rel = rid && all(part.rels, REL, "Relationship").find(r => r.getAttribute("Id") === rid);
    if (!rel) return;
    const size = await imageSize(deck, resolve(part.path, rel.getAttribute("Target")));
    if (!size) return;
    const [iw, ih] = size, b = box(pic);
    let src = kid(fill, A, "srcRect");
    const get = (k) => src ? (Number(src.getAttribute(k)) || 0) / 100000 : 0;
    const l = get("l"), r = get("r"), t = get("t"), bt = get("b");
    const visW = Math.max(1e-6, 1 - l - r) * iw, visH = Math.max(1e-6, 1 - t - bt) * ih;
    const scale = (visW / (b.w || 1) + visH / (b.h || 1)) / 2;
    const cx = (l + (1 - l - r) / 2) * iw, cy = (t + (1 - t - bt) / 2) * ih;
    let wantW = newW * scale, wantH = newH * scale;
    const shrink = Math.max(wantW / iw, wantH / ih, 1);
    wantW /= shrink; wantH /= shrink;
    const x0 = Math.min(Math.max(cx - wantW / 2, 0), iw - wantW), y0 = Math.min(Math.max(cy - wantH / 2, 0), ih - wantH);
    if (!src) { src = part.doc.createElementNS(A, "a:srcRect"); fill.insertBefore(src, blip.nextSibling); }
    const pct = (v) => String(Math.round(v * 100000));
    src.setAttribute("l", pct(x0 / iw)); src.setAttribute("r", pct((iw - x0 - wantW) / iw));
    src.setAttribute("t", pct(y0 / ih)); src.setAttribute("b", pct((ih - y0 - wantH) / ih));
  }
  const edges = (b, oldH) => [b.y <= oldH * EDGE, b.y + b.h >= oldH * (1 - EDGE)];
  function moveShapes(doc, oldH, newH) {               // layouts and masters: everything slides with the middle
    const shift = (newH - oldH) / 2;
    for (const el of shapesOf(doc)) {
      const b = box(el);
      if (!b) continue;
      const [atTop, atBottom] = edges(b, oldH);
      if (atTop && atBottom) setBox(el, { h: b.h + (newH - oldH) });
      else if (atTop) setBox(el, { h: Math.max(1, (b.y + b.h) + shift - b.y) });
      else if (atBottom) setBox(el, { y: Math.min(newH - 1, b.y + shift), h: (b.y + b.h + (newH - oldH)) - Math.min(newH - 1, b.y + shift) });
      else setBox(el, { y: Math.min(Math.max(b.y + shift, 0), Math.max(0, newH - b.h)) });
    }
  }
  function growText(el, factor, boxH) {
    if (!body(el)) return;
    const rs = paras(el).flatMap(p => runs(p));
    if (factor > 1 && boxH && rs.length) {
      const widthPt = Math.max(1, (box(el).w || 1) / EMU_PER_PT);
      const needed = (f) => paras(el).reduce((total, p) => {
        const t = runs(p).map(r => (kid(r, A, "t") || {}).textContent || "").join("");
        const size = Math.max(...runs(p).map(r => Number((kid(r, A, "rPr") || { getAttribute: () => 0 }).getAttribute("sz")) / 100).filter(Boolean), 18) * f;
        const per = Math.max(1, Math.floor(widthPt / (size * 0.56)));
        const lines = t.trim() ? Math.max(1, Math.ceil(t.length / per)) : 1;
        return total + lines * size * 1.2 * 1.2;
      }, 0) * EMU_PER_PT;
      const before = needed(1);
      while (factor > 1.0 && needed(factor) > Math.max(boxH, before * 1.02)) factor = Math.round((factor - 0.03) * 100) / 100;
      if (factor <= 1.0) return;
    }
    for (const p of paras(el)) {
      for (const rp of runs(p).map(r => kid(r, A, "rPr")).filter(Boolean))
        if (rp.getAttribute("sz")) rp.setAttribute("sz", String(Math.round(Number(rp.getAttribute("sz")) / 100 * factor * 2) / 2 * 100));
      const end = kid(p, A, "endParaRPr");
      if (end && end.getAttribute("sz")) end.setAttribute("sz", String(Math.floor(Number(end.getAttribute("sz")) * factor)));
    }
  }
  function clearRight(el, W) {
    const b = box(el), limit = W * (1 - TALL_RIGHT), over = b.x + b.w - limit;
    if (over <= 0) return;
    const centered = Math.abs(b.x + b.w / 2 - W / 2) < W * 0.03, cut = centered ? over * 2 : over;
    if (b.w - cut < W * 0.4) return;
    setBox(el, { x: b.x + (centered ? over : 0), w: b.w - cut });
  }
  async function rescale(deck, part, W, oldH, newH, grow) {
    let srcT = 0, srcB = 0, dstT = 0, dstB = 0;
    if (newH > oldH) { dstT = newH * TALL_TOP; dstB = newH * TALL_BOTTOM; } else { srcT = oldH * TALL_TOP; srcB = oldH * TALL_BOTTOM; }
    const k = (newH - dstT - dstB) / (oldH - srcT - srcB);
    const at = (y) => Math.min(newH, Math.max(0, (y - srcT) * k + dstT));
    for (const el of shapesOf(part.doc)) {
      const b = box(el);
      if (!b) continue;
      const [atTop, atBottom] = edges(b, oldH), isPic = tag(el) === "pic", small = b.w * b.h / Math.max(1, W * oldH) < SMALL;
      let top, size;
      if (atTop && atBottom) { top = b.y; size = newH - b.y - (oldH - (b.y + b.h)); }
      else if (atTop) { top = b.y; size = Math.max(1, at(b.y + b.h) - b.y); }
      else if (atBottom) { top = at(b.y); size = newH - (oldH - (b.y + b.h)) - top; }
      else if (tag(el) === "grpSp" || (isPic && (b.x <= W * EDGE || b.x + b.w >= W * (1 - EDGE)))) {
        setBox(el, { y: Math.min(Math.max(0, at(b.y + b.h / 2) - b.h / 2), Math.max(0, newH - b.h)) });
        continue;
      } else if (small && (isPic || !body(el) || !text(el).trim())) {
        let cx = b.x + b.w / 2;
        const cy = at(b.y + b.h / 2), nw = b.w * grow, nh = b.h * grow;
        if (Math.abs(cx - W / 2) > W * 0.05) cx = cx < W / 2 ? b.x + nw / 2 : b.x + b.w - nw / 2;
        setBox(el, { x: Math.max(0, cx - nw / 2), w: Math.min(W, nw), y: cy - nh / 2, h: nh });
        continue;
      } else { top = at(b.y); size = b.h * k; }
      if (isPic) await recrop(deck, part, el, b.w, Math.max(1, size));
      setBox(el, { y: top, h: Math.max(1, size) });
      if (body(el)) {
        if (newH > oldH && text(el).trim()) clearRight(el, W);
        growText(el, grow, box(el).h);
      }
    }
  }
  /** Reshape a filled deck to "4:5" or "9:16". Returns false when it already is that shape (or another shape). */
  async function reshape(deck, target) {
    const W = deck.W, oldH = deck.H, newH = Math.round(W * SHAPES[target]);
    if (Math.abs(newH - oldH) < W * 0.03) return false;
    if (!Object.values(SHAPES).some(v => Math.abs(oldH / (W || 1) - v) < 0.04)) return false;
    const done = new Set();
    for (const slide of deck.slides) {
      for (const r of all(slide.rels, REL, "Relationship").filter(r => /\/slideLayout$/.test(r.getAttribute("Type")))) {
        const layout = resolve(slide.path, r.getAttribute("Target"));
        const parts = [layout];
        try {
          const lrels = await deck.read(relsPathOf(layout));
          const m = all(lrels, REL, "Relationship").find(x => /\/slideMaster$/.test(x.getAttribute("Type")));
          if (m) parts.push(resolve(layout, m.getAttribute("Target")));
        } catch (e) {}
        for (const path of parts) {
          if (done.has(path)) continue;
          done.add(path);
          try { const doc = await deck.read(path); moveShapes(doc, oldH, newH); deck.zip.file(path, xml(doc)); } catch (e) {}
        }
      }
      await rescale(deck, slide, W, oldH, newH, newH > oldH ? GROW : SHRINK);
    }
    all(deck.pres, P, "sldSz")[0].setAttribute("cy", String(newH));
    deck.H = newH;
    return true;
  }

  async function save(deck) {
    for (const s of deck.slides) { deck.zip.file(s.path, xml(s.doc)); deck.zip.file(s.relsPath, xml(s.rels)); }
    deck.zip.file("ppt/presentation.xml", xml(deck.pres));
    deck.zip.file("ppt/_rels/presentation.xml.rels", xml(deck.presRels));
    deck.zip.file("[Content_Types].xml", xml(deck.types));
    return deck.zip.generateAsync({ type: "blob", compression: "DEFLATE",
                                    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }

  /** The filled deck for one post size ("4:5" or "9:16") as a .pptx Blob, plus notes. */
  async function build(bytes, plan, spare, blank, extras, sizeKey) {
    const { deck, notes, format } = await fill(bytes, plan, spare, blank, extras);
    if (format !== sizeKey) await reshape(deck, sizeKey);
    return { blob: await save(deck), notes };
  }

  return { open, describe, chooseSlides, fill, reshape, save, build, autoRoles, text, shapesOf };
})();
