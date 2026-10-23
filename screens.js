// Plan Builder for iPad: the screens that make and fix posts (Create Posts, Fix Post, Add Photos, Settings).
// The page itself (index.html) has the sign-in, clients and finished posts screens; make.js does the work.

const ICON2 = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  deck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  present: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
};
const LAYOUT_NAMES = { hook: "Hook (big photo)", statement: "Statement (dark)", split: "Photo beside words", tip: "Tip (photo on top)",
                       numbered: "Numbered", checklist: "Checklist", quote: "Quote", cta: "Call to action" };
const WORDS = { short: "Short", medium: "Medium", full: "Full" };
const HIDE_FROM_PICKER = /^(Brand|Templates|Client Info)(\/|$)/i;

function headerButton(html, label, onClick) {
  const b = $(`<button class="back hbtn" aria-label="${esc(label)}">${html}</button>`);
  b.onclick = onClick; head.append(b);
  return b;
}
function testBar() {
  if (!MAKE.testMode()) return;
  main.prepend($(`<div class="testbar">TEST MODE: everything you make goes in each client's <b>Testing</b> folder</div>`));
}
function busyBox(text) {
  const box = $(`<div class="busy"><div class="spin"></div><div class="busy-text"></div></div>`);
  box.querySelector(".busy-text").textContent = text;
  return { box, say: (t) => { box.querySelector(".busy-text").textContent = t; } };
}
function fail(e, where) {
  if (e.message === "signin") return;
  const text = (where ? where + ": " : "") + e.message;
  toast(e.message, true); logError(text); MAKE.logToDrive(new Date().toISOString() + " " + text);
}
function seg(options, value, onPick) {
  const box = $(`<div class="seg"></div>`);
  Object.entries(options).forEach(([key, label]) => {
    const b = $(`<button class="${key === value ? "on" : ""}">${esc(label)}</button>`);
    b.onclick = () => { box.querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); onPick(key); };
    box.append(b);
  });
  return box;
}

// ---------- Settings (the gear): the AI, Test mode and the AI keys, all kept on this iPad ----------
async function showSettings() {
  header("Settings", "Kept on this iPad", showClients);
  try { await MAKE.settings(); } catch (e) {}
  const has = (k) => !!MAKE.local(k);
  main.append($(`<div>
    <h2>AI</h2><div id="ai"></div>
    <p class="muted">Gemini is free. Claude costs a little per post, and works for photos Gemini refuses (like children's photos).</p>
    <h2>Test mode</h2>
    <label class="switch-row"><span>Put everything in each client's Testing folder</span><input type="checkbox" id="test" ${MAKE.testMode() ? "checked" : ""}></label>
    <h2>AI keys</h2>
    <p class="muted">Type or paste each key once. It stays on this iPad only (never on GitHub, in Drive, or in a chat), and only goes to Google's or Anthropic's own address when you make a post. Easiest: make a new key just for the iPad, in Safari on the iPad: Gemini at <b>aistudio.google.com/apikey</b>, Claude at <b>console.anthropic.com</b> (Settings &gt; API keys). Then you can turn off just the iPad's key if the iPad is ever lost.</p>
    <div class="field"><label for="gk">Gemini key ${has("gemini_key") ? '<span class="ok">✓ saved</span>' : ""}</label>
      <input id="gk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${has("gemini_key") ? "Saved. Type a new one to replace it." : "AIza..."}"></div>
    <div class="field"><label for="ck">Claude key ${has("claude_key") ? '<span class="ok">✓ saved</span>' : ""}</label>
      <input id="ck" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${has("claude_key") ? "Saved. Type a new one to replace it." : "sk-ant-..."}"></div>
    <div class="row2"><button class="btn" id="savekeys">Save Keys</button><button class="btn ghost" id="forget">Remove Keys</button></div>
    <p class="muted" style="margin-top:14px">Good idea: set a monthly spending limit for the Claude key at console.anthropic.com (Settings &gt; Limits).</p>
    <h2>Brand Kits</h2>
    <p class="muted" id="kits">Checking...</p>
    <h2>Problems</h2>
    <p class="muted">Errors show on the screen, and are also saved in <b>Plan Builder iPad - error_log.txt</b> in your main Drive folder. Send that file to Claude.</p>
  </div>`));
  document.getElementById("ai").append(seg({ gemini: "Gemini (free)", claude: "Claude" }, MAKE.engine(), (k) => { MAKE.setLocal("ai", k); toast((k === "claude" ? "Claude" : "Gemini") + " will make the posts"); }));
  document.getElementById("test").onchange = (e) => { MAKE.setLocal("test", e.target.checked ? "1" : ""); toast(e.target.checked ? "Test mode is on" : "Test mode is off"); };
  document.getElementById("savekeys").onclick = () => {
    const g = document.getElementById("gk").value.trim(), c = document.getElementById("ck").value.trim();
    if (!g && !c) return toast("Type a key first.", true);
    if (g) MAKE.setLocal("gemini_key", g.replace(/^["']|["']$/g, ""));
    if (c) MAKE.setLocal("claude_key", c.replace(/^["']|["']$/g, ""));
    toast("Saved on this iPad"); showSettings();
  };
  document.getElementById("forget").onclick = () => {
    if (!confirm("Remove both AI keys from this iPad?")) return;
    MAKE.setLocal("gemini_key", ""); MAKE.setLocal("claude_key", ""); toast("Keys removed"); showSettings();
  };
  try {
    const s = await MAKE.settings(true), n = Object.keys(s.brand_kits || {}).length, kits = document.getElementById("kits");
    if (kits) kits.innerHTML = s._saved_at
      ? `${n} Brand Kit${n === 1 ? "" : "s"} from your computer (it shares them when Plan Builder Version 81 or newer connects to Drive). Change them on the computer.`
      : "Your computer hasn't shared its settings yet. Install Plan Builder Version 81 and click Connect Drive once. Until then, posts use plain colors and fonts.";
  } catch (e) { const kits = document.getElementById("kits"); if (kits) kits.textContent = "Couldn't read them right now."; }
}

// ---------- Add Photos (from the camera or the iPad's photos, into Raw Photos) ----------
function pickFiles(then) {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*"; input.multiple = true; input.style.display = "none";
  input.onchange = () => { const files = [...input.files]; input.remove(); if (files.length) then(files); };
  document.body.append(input); input.click();
}
function addPhotos(client, after) {
  pickFiles(async (files) => {
    const { box, say } = busyBox("Uploading...");
    document.body.append(Object.assign(box, { className: "busy overlay" }));
    try {
      const made = await MAKE.addPhotos(client, files, say);
      toast(`${made.length} photo${made.length === 1 ? "" : "s"} added to Raw Photos`);
      after && after(made);
    } catch (e) { fail(e, "Add Photos"); }
    box.remove();
  });
}

// ---------- Create Posts ----------
let create = null;
async function showCreate(client) {
  create = { client, photos: [], chosen: [], folder: "All", count: 1, words: "medium", note: "", result: null };
  pickScreen();
}
async function pickScreen() {
  const c = create;
  header("Create Posts", c.client + " · pick the photos", () => showPosts(c.client));
  testBar();
  main.append($(`<div><p class="msg">Tap the photos for the post, in the order you like. Up to 20.</p>
    <div class="chips" id="folders"></div><div class="pick" id="pick">${'<div class="skel" style="aspect-ratio:1"></div>'.repeat(8)}</div></div>`));
  const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn ghost" id="add">${ICON2.camera}Add from iPad</button>
    <button class="btn" id="next">Next</button></div></div>`);
  document.body.append(bar);
  const next = document.getElementById("next");
  const count = () => { next.textContent = c.chosen.length ? `Next (${c.chosen.length} photo${c.chosen.length === 1 ? "" : "s"})` : "Next"; };
  count();
  document.getElementById("add").onclick = () => addPhotos(c.client, (made) => {
    c.photos = [...made, ...c.photos]; made.forEach(m => { if (c.chosen.length < 20) c.chosen.push(m.id); });
    c.folder = "All"; pickScreen();
  });
  next.onclick = () => { if (!c.chosen.length) return toast("Tap at least one photo.", true); optionsScreen(); };
  try {
    if (!c.photos.length) {
      const all = (await api("api/media?client=" + encodeURIComponent(c.client))).photos;
      c.all = all;
      c.photos = all.filter(p => !HIDE_FROM_PICKER.test(p.path)).sort((a, b) => (a.made < b.made ? 1 : -1));
    }
    drawPick(count);
  } catch (e) { fail(e, "Create Posts"); const grid = document.getElementById("pick"); if (grid) grid.innerHTML = ""; }
}
function drawPick(count) {
  const c = create, chips = document.getElementById("folders"), grid = document.getElementById("pick");
  if (!chips || !grid) return;
  const folders = [...new Set(c.photos.map(p => p.folder))];
  chips.innerHTML = "";
  ["All", ...folders].forEach(f => {
    const n = f === "All" ? c.photos.length : c.photos.filter(p => p.folder === f).length;
    const chip = $(`<button class="chip ${c.folder === f ? "on" : ""}">${esc(f)}<b>${n}</b></button>`);
    chip.onclick = () => { c.folder = f; drawPick(count); };
    chips.append(chip);
  });
  grid.innerHTML = "";
  const shown = c.photos.filter(p => c.folder === "All" || p.folder === c.folder);
  if (!c.photos.length) grid.append($(`<div class="empty-state" style="grid-column:1/-1"><div class="big">📷</div>No photos in ${esc(c.client)}'s folders yet. Tap <b>Add from iPad</b>.</div>`));
  shown.forEach(p => {
    const tile = $(`<button class="tile"><img loading="lazy" alt=""><span class="n"></span></button>`);
    tile.querySelector("img").src = MAKE.photoUrl(p.id, false);
    const mark = () => { const i = c.chosen.indexOf(p.id); tile.classList.toggle("on", i >= 0); tile.querySelector(".n").textContent = i >= 0 ? i + 1 : ""; };
    tile.onclick = () => {
      const i = c.chosen.indexOf(p.id);
      if (i >= 0) c.chosen.splice(i, 1); else if (c.chosen.length < 20) c.chosen.push(p.id); else return toast("20 photos at most.", true);
      grid.querySelectorAll(".tile").forEach(t => t._mark && t._mark()); count();
    };
    tile._mark = mark; mark();
    grid.append(tile);
  });
}
function optionsScreen() {
  const c = create, name = MAKE.engine() === "claude" ? "Claude" : "Gemini";
  header("Create Posts", c.client + " · " + c.chosen.length + " photos", pickScreen);
  testBar();
  main.append($(`<div>
    <h2>How many posts</h2><div id="count"></div>
    <h2>Words on each slide</h2><div id="words"></div>
    <h2>What's it about? (optional)</h2>
    <textarea class="text" id="note" rows="3" placeholder="For example: our new fall menu, or the open house on Saturday"></textarea>
    <p class="muted">${name} plans the slides and writes the caption and hashtags. Change the AI under the gear on the Clients screen. Each post is made in both sizes: Instagram 4:5 and Facebook / TikTok 9:16.</p>
  </div>`));
  const most = Math.max(1, Math.min(3, c.chosen.length));
  if (c.count > most) c.count = most;
  const counts = {}; for (let i = 1; i <= most; i++) counts[i] = String(i);
  document.getElementById("count").append(seg(counts, String(c.count), (k) => c.count = Number(k)));
  document.getElementById("words").append(seg(WORDS, c.words, (k) => c.words = k));
  const note = document.getElementById("note"); note.value = c.note; note.oninput = () => c.note = note.value;
  const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn" id="go">${ICON2.spark}Make Posts</button></div></div>`);
  document.body.append(bar);
  document.getElementById("go").onclick = makeScreen;
}
async function makeScreen() {
  const c = create;
  header("Create Posts", c.client, optionsScreen);
  testBar();
  const { box, say } = busyBox("Starting...");
  main.append(box);
  try {
    const photos = c.chosen.map(id => c.photos.find(p => p.id === id)).filter(Boolean);
    c.result = await MAKE.plan(c.client, photos, { count: c.count, words: c.words, note: c.note.trim() }, say);
    say("Drawing the slides with the Brand Kit...");
    c.brand = await MAKE.brand(c.client, c.all || c.photos);
    c.result.posts.forEach(p => p.saved = null);
    reviewScreen();
  } catch (e) {
    fail(e, "Create Posts");
    box.replaceWith($(`<div class="empty-state"><div class="big">⚠️</div>${esc(e.message === "signin" ? "Please sign in again." : e.message)}</div>`));
    const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn" id="again">Try Again</button></div></div>`);
    document.body.append(bar); document.getElementById("again").onclick = makeScreen;
  }
}
async function reviewScreen(keepScroll) {
  const c = create, at = window.scrollY;
  header("Check the posts", c.client + " · made by " + c.result.engine, optionsScreen);
  testBar();
  if (c.brand.notes.length) main.append($(`<p class="msg">Heads up: ${esc(c.brand.notes.join(", "))} isn't a free Google Font, so a close match is used here. The computer uses the real font.</p>`));
  for (let i = 0; i < c.result.posts.length; i++) main.append(await postCard(c.result.posts[i], i));
  const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn green" id="saveall">${ICON2.save}Save ${c.result.posts.length > 1 ? "All " : ""}to Final Posts</button></div></div>`);
  document.body.append(bar);
  const saveAll = document.getElementById("saveall");
  const allSaved = () => c.result.posts.every(p => p.saved);
  if (allSaved()) { saveAll.className = "btn done"; saveAll.innerHTML = ICON.check + "Saved. See Finished Posts"; }
  saveAll.onclick = async () => {
    if (allSaved()) return showPosts(c.client);
    for (const post of c.result.posts) if (!post.saved && !(await savePost(post))) return;
    toast(MAKE.testMode() ? "Saved in the Testing folder" : "Saved to Final Posts");
    reviewScreen(true);
  };
  if (keepScroll) window.scrollTo(0, at);
}
async function savePost(post) {
  const c = create, { box, say } = busyBox("Saving...");
  box.className = "busy overlay"; document.body.append(box);
  try {
    post.saved = await MAKE.save(c.client, post, c.brand, c.result.tips, say, post.saved && post.saved.where);
    box.remove(); return true;
  } catch (e) { box.remove(); fail(e, "Saving a post"); return false; }
}
async function postCard(post, index) {
  const c = create;
  const card = $(`<section class="pcard"><div class="pcard-head"><input class="ptitle" aria-label="Post name"><span class="pill2 ${post.saved ? "ok" : ""}">${post.saved ? "✓ Saved" : "Not saved yet"}</span></div>
    <div class="sizes" data-sizes></div><div class="swipe" data-swipe></div>
    <p class="hint">Swipe through the slides. Tap Edit Slides to change words or photos.</p>
    <div class="row2"><button class="btn ghost" data-edit>${ICON2.pencil}Edit Slides</button><button class="btn ${post.saved ? "done" : "green"}" data-save>${post.saved ? ICON.check + "Saved" : ICON2.save + "Save This Post"}</button></div>
    <h2>Tagline</h2><input class="text" data-tagline>
    <h2>Caption</h2><textarea class="text" rows="6" data-caption></textarea>
    <h2>Hashtags</h2><textarea class="text" rows="2" data-tags></textarea>
  </section>`);
  const title = card.querySelector(".ptitle"); title.value = post.title;
  title.onchange = () => { post.title = MAKE.safeName(title.value); title.value = post.title; post.saved = null; };
  const bind = (sel, key) => { const el = card.querySelector(sel); el.value = post[key] || ""; el.oninput = () => { post[key] = el.value; post.dirty = true; }; };
  bind("[data-tagline]", "tagline"); bind("[data-caption]", "caption"); bind("[data-tags]", "hashtags");
  const swipe = card.querySelector("[data-swipe]");
  let size = "4:5";
  const draw = async () => {
    swipe.innerHTML = '<div class="skel" style="aspect-ratio:4/5"></div>';
    const canvases = await MAKE.render(post, c.brand, size);
    swipe.innerHTML = "";
    canvases.forEach(cv => { const img = document.createElement("img"); img.src = cv.toDataURL("image/jpeg", 0.85); img.alt = ""; swipe.append(img); });
  };
  card.querySelector("[data-sizes]").append(seg({ "4:5": "Instagram 4:5", "9:16": "Facebook · TikTok 9:16" }, size, (k) => { size = k; draw(); }));
  draw().catch(e => fail(e, "Drawing slides"));
  card.querySelector("[data-edit]").onclick = () => editSlides(post, c.client, c.brand, c.all || c.photos, () => { post.saved = post.saved ? Object.assign(post.saved, { stale: true }) : null; reviewScreen(true); }, "Back to the posts");
  card.querySelector("[data-save]").onclick = async () => {
    if (post.saved && !post.dirty && !post.saved.stale) return toast("Already saved. Edit it to save again.");
    if (await savePost(post)) { post.dirty = false; if (post.saved) delete post.saved.stale; toast(MAKE.testMode() ? "Saved in the Testing folder" : "Saved to Final Posts"); reviewScreen(true); }
  };
  if (post.saved && (post.dirty || post.saved.stale)) {
    const b = card.querySelector("[data-save]"); b.className = "btn green"; b.innerHTML = ICON2.save + "Save Changes";
  }
  return card;
}

// ---------- editing slides (words, layout, photo), for a new post or one made on the iPad ----------
function editSlides(post, client, brand, photos, done, backLabel) {
  header("Edit Slides", post.title, done);
  const list = $(`<div></div>`);
  main.append(list);
  const draw = () => {
    list.innerHTML = "";
    post.slides.forEach((s, i) => {
      const row = $(`<section class="sedit"><div class="sedit-top"><b>Slide ${i + 1}</b><select data-layout></select>
        <button class="mini" data-up ${i ? "" : "disabled"}>↑</button><button class="mini" data-down ${i < post.slides.length - 1 ? "" : "disabled"}>↓</button>
        <button class="mini bad" data-del ${post.slides.length > 2 ? "" : "disabled"}>✕</button></div>
        <div class="sedit-body"><button class="sphoto" data-photo>${s.photo ? `<img alt="">` : "<span>No photo<br>Tap to add</span>"}</button>
        <div class="sfields"><input class="text" data-k="eyebrow" placeholder="Small words above (optional)">
        <input class="text" data-k="title" placeholder="Headline. Put *key words* in stars">
        <textarea class="text" rows="3" data-k="body" placeholder="Body words"></textarea>
        ${s.layout === "checklist" ? '<textarea class="text" rows="4" data-items placeholder="One list item per line"></textarea>' : ""}
        ${s.layout === "numbered" ? '<input class="text" data-k="num" placeholder="Number" inputmode="numeric">' : ""}
        ${s.layout === "quote" ? '<input class="text" data-k="label" placeholder="Who said it">' : ""}
        ${s.layout === "cta" ? '<input class="text" data-k="button" placeholder="Button words, like Book now">' : ""}</div></div></section>`);
      const select = row.querySelector("[data-layout]");
      Object.entries(LAYOUT_NAMES).forEach(([k, label]) => select.append(new Option(label, k, false, k === s.layout)));
      select.onchange = () => { s.layout = select.value; post.dirty = true; draw(); };
      row.querySelectorAll("[data-k]").forEach(el => { el.value = s[el.dataset.k] || ""; el.oninput = () => { s[el.dataset.k] = el.value; post.dirty = true; }; });
      const items = row.querySelector("[data-items]");
      if (items) { items.value = (s.items || []).join("\n"); items.oninput = () => { s.items = items.value.split("\n").map(t => t.trim()).filter(Boolean).slice(0, 6); post.dirty = true; }; }
      if (s.photo) row.querySelector("[data-photo] img").src = MAKE.photoUrl(s.photo.id, false);
      row.querySelector("[data-photo]").onclick = () => choosePhoto(client, photos, s.photo, (picked) => { s.photo = picked; post.dirty = true; draw(); });
      row.querySelector("[data-up]").onclick = () => { post.slides.splice(i - 1, 0, post.slides.splice(i, 1)[0]); post.dirty = true; draw(); };
      row.querySelector("[data-down]").onclick = () => { post.slides.splice(i + 1, 0, post.slides.splice(i, 1)[0]); post.dirty = true; draw(); };
      row.querySelector("[data-del]").onclick = () => { if (confirm(`Remove slide ${i + 1}?`)) { post.slides.splice(i, 1); post.dirty = true; draw(); } };
      list.append(row);
    });
    const add = $(`<button class="btn ghost" style="margin-top:6px">${ICON2.plus}Add a Slide</button>`);
    add.onclick = () => { post.slides.splice(post.slides.length - 1, 0, { layout: "tip", eyebrow: "", title: "", body: "", items: [] }); post.dirty = true; draw(); };
    list.append(add);
  };
  draw();
  const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn" id="donebtn">${esc(backLabel || "Done")}</button></div></div>`);
  document.body.append(bar);
  document.getElementById("donebtn").onclick = done;
}
async function choosePhoto(client, photos, current, then) {
  const sheet = $(`<div class="sheet"><div class="sheet-in"><div class="sheet-head"><b>Pick a photo</b>
    <button class="mini" data-none>No photo</button><button class="mini" data-add>${ICON2.camera} Add</button><button class="mini" data-close>Close</button></div>
    <div class="pick" data-grid></div></div></div>`);
  document.body.append(sheet);
  const close = () => sheet.remove();
  sheet.querySelector("[data-close]").onclick = close;
  sheet.querySelector("[data-none]").onclick = () => { close(); then(null); };
  sheet.querySelector("[data-add]").onclick = () => addPhotos(client, (made) => { photos.unshift(...made); close(); then({ id: made[0].id, name: made[0].name }); });
  const grid = sheet.querySelector("[data-grid]");
  if (!photos.length) {
    try { photos.push(...(await api("api/media?client=" + encodeURIComponent(client))).photos); } catch (e) { fail(e); }
  }
  photos.filter(p => !HIDE_FROM_PICKER.test(p.path || "")).forEach(p => {
    const tile = $(`<button class="tile ${current && current.id === p.id ? "on" : ""}"><img loading="lazy" alt=""><span class="n">${current && current.id === p.id ? "✓" : ""}</span></button>`);
    tile.querySelector("img").src = MAKE.photoUrl(p.id, false);
    tile.onclick = () => { close(); then({ id: p.id, name: p.name }); };
    grid.append(tile);
  });
}

// ---------- Fix Post: a finished post's caption, and (for posts made on the iPad) its slides ----------
async function showFix(index) {
  const post = state.posts[index], client = state.client;
  const set = post.sizes["4:5"] || post.sizes["9:16"];
  header("Fix Post", post.name, () => showPost(index));
  testBar();
  main.append($(`<div>
    <h2>Caption</h2><textarea class="text" rows="12" id="cap" placeholder="Loading..."></textarea>
    <div class="row2"><button class="btn green" id="savecap">${ICON2.save}Save Caption</button><button class="btn ghost" id="ai">${ICON2.spark}Rewrite with AI</button></div>
    <input class="text" id="aiNote" placeholder="What to change (optional), like: shorter, mention the open house" style="margin-top:10px">
    <h2>Slides</h2><div id="slides"><div class="skel" style="height:62px"></div></div></div>`));
  const cap = document.getElementById("cap");
  let captionId = set.caption;
  try { cap.value = set.caption ? (await api("api/caption?id=" + encodeURIComponent(set.caption))).text : ""; cap.placeholder = "No caption yet. Type one, or tap Rewrite with AI."; }
  catch (e) { fail(e); }
  document.getElementById("savecap").onclick = async () => {
    try {
      for (const size of Object.keys(post.sizes)) {       // both sizes share one caption
        const s = post.sizes[size];
        await MAKE.saveCaption(s.caption, s.folderId, post.name, cap.value.trim() + "\n");
      }
      toast("Caption saved (both sizes)");
    } catch (e) { fail(e, "Saving a caption"); }
  };
  document.getElementById("ai").onclick = async () => {
    const { box, say } = busyBox("Starting...");
    box.className = "busy overlay"; document.body.append(box);
    try { cap.value = await MAKE.rewriteCaption(client, post.name, set.images, cap.value, document.getElementById("aiNote").value.trim(), say); toast("New caption. Check it, then tap Save Caption."); }
    catch (e) { fail(e, "Rewrite with AI"); }
    box.remove();
  };
  const slides = document.getElementById("slides");
  const planId = (post.sizes["4:5"] || {}).plan || (post.sizes["9:16"] || {}).plan;
  if (!planId) {
    slides.innerHTML = `<p class="muted">These slides were made on the computer. Change them there with Change Post (it keeps the PowerPoint deck in step), then export again.</p>`;
    return;
  }
  let plan;
  try { plan = JSON.parse((await api("api/text?id=" + encodeURIComponent(planId))).text); }
  catch (e) { slides.innerHTML = `<p class="muted">This post's slide plan couldn't be read, so only the caption can be changed here.</p>`; return; }
  slides.innerHTML = `<p class="muted">Made on the iPad, so you can change the words and photos here and remake both sizes.</p>`;
  const edit = $(`<button class="btn">${ICON2.pencil}Change the Slides</button>`);
  slides.append(edit);
  edit.onclick = async () => {
    const working = { title: plan.title || post.name, slides: plan.slides, tagline: plan.tagline, caption: plan.caption, hashtags: plan.hashtags, alt: plan.alt || [] };
    const photos = [];
    editSlides(working, client, null, photos, () => remakeScreen(index, working, cap.value), "Next: Check and Remake");
  };
}
async function remakeScreen(index, working, captionNow) {
  const post = state.posts[index], client = state.client;
  header("Remake Slides", post.name, () => showFix(index));
  testBar();
  const { box, say } = busyBox("Drawing the slides...");
  main.append(box);
  try {
    const brand = await MAKE.brand(client, (await api("api/media?client=" + encodeURIComponent(client))).photos);
    const canvases = await MAKE.render(working, brand, "4:5");
    box.remove();
    const swipe = $(`<div class="swipe"></div>`);
    canvases.forEach(cv => { const img = document.createElement("img"); img.src = cv.toDataURL("image/jpeg", 0.85); swipe.append(img); });
    main.append(swipe, $(`<p class="hint">The Instagram 4:5 slides. The 9:16 ones are remade the same way.</p>`));
    const bar = $(`<div class="bar"><div class="bar-inner"><button class="btn ghost" id="more">${ICON2.pencil}Keep Editing</button><button class="btn green" id="remake">${ICON2.save}Replace the Slides</button></div></div>`);
    document.body.append(bar);
    document.getElementById("more").onclick = () => editSlides(working, client, null, [], () => remakeScreen(index, working, captionNow), "Next: Check and Remake");
    document.getElementById("remake").onclick = async () => {
      const where = {};
      for (const k of Object.keys(post.sizes)) if (post.sizes[k].folderId) where[k] = post.sizes[k].folderId;
      const parsed = parseCaption(captionNow);
      Object.assign(working, parsed);
      working.title = post.name;
      const { box: b, say: s } = busyBox("Saving...");
      b.className = "busy overlay"; document.body.append(b);
      try {
        await MAKE.save(client, working, brand, parsed.tips, s, where);
        b.remove(); toast("Slides replaced (both sizes)");
        showPosts(client);
      } catch (e) { b.remove(); fail(e, "Remake Slides"); }
    };
  } catch (e) { fail(e, "Remake Slides"); box.replaceWith($(`<div class="empty-state">${esc(e.message)}</div>`)); }
}
/** Caption.txt back into its parts (so a remake keeps the caption as it is now). */
function parseCaption(text) {
  const t = String(text || "");
  const grab = (re) => (t.match(re) || [, ""])[1].trim();
  return { tagline: grab(/Tagline:\s*(.*)/i), caption: grab(/Caption:\s*\n([\s\S]*?)\n\s*Hashtags:/i) || "",
           hashtags: grab(/Hashtags:\s*(.*)/i), alt: (grab(/Alt text:\s*\n([\s\S]*?)(\n\s*\n|\nPOSTING TIPS|$)/i)).split("\n").map(s => s.trim()).filter(Boolean),
           tips: grab(/POSTING TIPS[^\n]*\n([\s\S]*)$/i) };
}

// ---------- the client screen's Drive Folder button and "About this client" ----------
const driveFolder = (id) => "https://drive.google.com/drive/folders/" + encodeURIComponent(id);
async function clientInfo(client) {
  const link = document.getElementById("drive"), about = document.getElementById("about");
  try {
    const f = await api("api/folders?client=" + encodeURIComponent(client));
    const id = MAKE.testMode() && f.testing ? f.testing : f.id;
    if (link) link.href = driveFolder(id);
    const s = await MAKE.settings(), boxes = (s.client_info || {})[client] || {}, kit = MAKE.brandKit(client);
    const about2 = ((s.inspiration || {})[client] || {}).about;
    const site = (boxes.website || "").trim(), href = site && !/^https?:/i.test(site) ? "https://" + site : site;
    const rows = [];
    if (about2) rows.push(`<div><b>What they do</b>${esc(about2)}</div>`);
    if (site) rows.push(`<div><b>Website</b><a class="link" href="${esc(href)}" target="_blank" rel="noopener">${esc(site)}</a></div>`);
    if (kit.contact) rows.push(`<div><b>Contact line</b>${esc(kit.contact)}</div>`);
    if (boxes.notes) rows.push(`<div><b>Notes</b>${esc(boxes.notes)}</div>`);
    if (f.strategy) rows.push(`<div><b>Strategy</b><a class="link" href="https://docs.google.com/document/d/${encodeURIComponent(f.strategy.id)}/edit" target="_blank" rel="noopener">${esc(f.strategy.name)}</a></div>`);
    rows.push(`<div><b>Drive</b><a class="link" href="${driveFolder(f.id)}" target="_blank" rel="noopener">Open ${esc(client)}'s folder</a>${f.testing ? ` · <a class="link" href="${driveFolder(f.testing)}" target="_blank" rel="noopener">Testing folder</a>` : ""}</div>`);
    if (about) about.innerHTML = `<div class="info">${rows.join("")}</div>
      <h2>Notes</h2><div class="info" id="notes"><span class="muted">Loading...</span></div>
      <div class="row2"><button class="btn ghost" id="addnote">${ICON2.pencil}Add a Note</button></div>`;
    const addBtn = document.getElementById("addnote");
    if (addBtn) addBtn.onclick = () => addNoteBox(client);
    drawNotes(client);
  } catch (e) { if (about) about.innerHTML = ""; if (e.message === "signin") return; logError("client info: " + e.message); }
}

// ---------- Decks: the PowerPoint decks Create Posts made on the computer ----------
async function showDecks(client) {
  header("Decks", client + " · PowerPoint", () => showPosts(client));
  testBar();
  main.append($(`<div>
    <p class="msg">Tap <b>Open</b> to open a deck in the Drive app. To change it in PowerPoint, open PowerPoint on the iPad and go to
    Open &gt; Browse &gt; Google Drive, so your changes save back to the same deck. (Drive's own "Open in" menu makes a copy instead.)
    Then tap <b>Make JPGs</b> to put fresh posting JPGs in Final Posts.</p>
    <div id="decklist">${'<div class="skel" style="height:66px;margin-bottom:8px"></div>'.repeat(4)}</div></div>`));
  const list = document.getElementById("decklist");
  try {
    const { decks } = await api("api/decks?client=" + encodeURIComponent(client) + (MAKE.testMode() ? "&test=1" : ""));
    if (!list) return;
    list.innerHTML = "";
    if (!decks.length) {
      list.append($(`<div class="empty-state"><div class="big">🖥️</div>No PowerPoint decks for ${esc(client)}${MAKE.testMode() ? " in Testing" : ""} yet.<br>Create Posts on the computer makes them.</div>`));
      return;
    }
    let run = null;
    decks.forEach(deck => {
      if (deck.run !== run) { run = deck.run; list.append($(`<h2>${esc(run)}</h2>`)); }
      const row = $(`<div class="deck"><div class="ic">PPT</div><div class="nm"><div></div><div></div></div>
        <a class="mini" target="_blank" rel="noopener">Open</a><button class="mini" data-jpgs>Make JPGs</button></div>`);
      row.querySelector(".nm div").textContent = deck.name.replace(/\.pptx$/i, "");
      row.querySelector(".nm div + div").textContent = (deck.size === "9:16" ? "Facebook · TikTok 9:16" : "Instagram 4:5")
        + (deck.modified ? " · changed " + new Date(deck.modified).toLocaleDateString() : "");
      row.querySelector("a").href = "https://drive.google.com/file/d/" + encodeURIComponent(deck.id) + "/view";
      row.querySelector("[data-jpgs]").onclick = () => deckJpgs(client, deck);
      list.append(row);
    });
  } catch (e) { fail(e, "Decks"); if (list) list.innerHTML = ""; }
}
async function deckJpgs(client, deck) {
  if (!confirm(`Make fresh posting JPGs from "${deck.post}"? They replace this post's JPGs in Final Posts (its caption stays).`)) return;
  const { box, say } = busyBox("Starting...");
  box.className = "busy overlay"; document.body.append(box);
  try {
    const made = await MAKE.deckToFinal(client, deck, MAKE.testMode(), say);
    box.remove();
    toast(`${made.count} JPGs saved in Final Posts (${made.sizeKey})`);
  } catch (e) { box.remove(); fail(e, "Make JPGs from a deck"); }
}

// ---------- quick notes about a client (their "iPad Notes" doc in Drive; Create Posts reads them too) ----------
async function drawNotes(client, text) {
  const box = document.getElementById("notes");
  if (!box) return;
  try {
    if (text === undefined) text = await MAKE.notes(client);
    text = String(text || "").replace(new RegExp("^\\s*" + client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " - iPad Notes\\s*", "i"), "").trim();
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    box.innerHTML = lines.length ? lines.slice(0, 8).map(l => `<div>${esc(l)}</div>`).join("") +
      (lines.length > 8 ? `<div class="muted">and ${lines.length - 8} older...</div>` : "")
      : `<span class="muted">No notes yet. Notes you add here go in their "iPad Notes" doc in Drive, and Create Posts reads them.</span>`;
    const link = await MAKE.docLink(client);
    if (link && document.getElementById("notes")) box.append($(`<div><a class="link" href="${esc(link)}" target="_blank" rel="noopener">Open the notes doc</a></div>`));
  } catch (e) { if (e.message !== "signin") box.innerHTML = `<span class="muted">Couldn't read the notes right now.</span>`; }
}
function addNoteBox(client) {
  const sheet = $(`<div class="sheet"><div class="sheet-in"><div class="sheet-head"><b>Note about ${esc(client)}</b><button class="mini" data-close>Cancel</button></div>
    <textarea class="text" rows="5" placeholder="For example: wants more team photos, closed Mondays, new phone number..."></textarea>
    <div class="row2"><button class="btn green" data-save>${ICON2.save}Save Note</button></div></div></div>`);
  document.body.append(sheet);
  const box = sheet.querySelector("textarea"); box.focus();
  sheet.querySelector("[data-close]").onclick = () => sheet.remove();
  sheet.querySelector("[data-save]").onclick = async () => {
    if (!box.value.trim()) return toast("Type the note first.", true);
    const btn = sheet.querySelector("[data-save]"); btn.disabled = true; btn.textContent = "Saving...";
    try { const all = await MAKE.addNote(client, box.value); sheet.remove(); toast("Note saved"); drawNotes(client, all); }
    catch (e) { btn.disabled = false; btn.innerHTML = ICON2.save + "Save Note"; fail(e, "Saving a note"); }
  };
}

// ---------- Show to Client: their waiting posts, full screen, one at a time ----------
async function showToClient(client) {
  const waiting = (state.posts || []).filter(p => !p.approved);
  if (!waiting.length) return toast("Nothing is waiting for their OK.");
  const view = $(`<div class="show"><div class="show-top"><div class="who"></div><div class="count"></div>
    <button class="mini" data-finish>Finish</button></div><div class="show-mid"></div><div class="show-bottom"></div></div>`);
  view.querySelector(".who").textContent = client;
  document.body.append(view);
  const mid = view.querySelector(".show-mid"), bottom = view.querySelector(".show-bottom"), count = view.querySelector(".count");
  let at = 0, approved = 0, changes = 0;
  const finish = () => { view.remove(); showPosts(client, true); };
  view.querySelector("[data-finish]").onclick = () => { if (at >= waiting.length || confirm("Finish showing the posts?")) finish(); };
  const done = () => {
    count.textContent = "";
    mid.innerHTML = `<div class="show-done"><div class="big">🎉</div><h1>All done. Thank you!</h1>
      <p class="muted">${approved} approved${changes ? `, ${changes} with changes to make` : ""}.</p></div>`;
    bottom.innerHTML = ""; const b = $(`<button class="btn">Finish</button>`); b.onclick = finish; bottom.append(b);
  };
  const show = () => {
    if (at >= waiting.length) return done();
    const post = waiting[at], set = post.sizes["4:5"] || post.sizes["9:16"];
    count.textContent = `${at + 1} of ${waiting.length}`;
    mid.innerHTML = `<h1 style="font-size:22px;margin:4px 0 12px">${esc(post.name)}</h1><div class="swipe"></div>
      <p class="hint">Swipe to see every slide.</p><div class="caption empty">Loading the caption...</div>`;
    const swipe = mid.querySelector(".swipe");
    if (set.video) swipe.append($(`<video src="${file(set.video)}" controls playsinline preload="metadata"></video>`));
    set.images.forEach(id => swipe.append($(`<img src="${file(id)}" alt="">`)));
    const cap = mid.querySelector(".caption");
    if (set.caption) api("api/caption?id=" + encodeURIComponent(set.caption)).then(d => {
      // just what gets posted: tagline, caption and hashtags (not the alt text or posting tips)
      const text = String(d.text || "").split(/\n\s*(Alt text:|POSTING TIPS)/i)[0].split("\n").slice(1).join("\n")
        .replace(/^\s*Tagline:\s*/im, "").replace(/^\s*Caption:\s*$/im, "").replace(/^\s*Hashtags:\s*/im, "").replace(/\n{3,}/g, "\n\n").trim();
      cap.textContent = text || "No caption yet."; cap.classList.toggle("empty", !text);
    }).catch(() => { cap.textContent = ""; });
    else cap.textContent = "No caption yet.";
    bottom.innerHTML = "";
    const no = $(`<button class="btn ghost">${ICON2.pencil}Needs Changes</button>`), yes = $(`<button class="btn green">${ICON.check}Looks Good</button>`);
    bottom.append(no, yes);
    yes.onclick = async () => {
      yes.disabled = no.disabled = true;
      try {
        const r = await api("api/approve?client=" + encodeURIComponent(client) + "&post=" + encodeURIComponent(post.post), { client, post: post.post });
        post.approved = r.approved; approved++;
        if ((state.feedback || {})[MAKE.changeKey(client, post.post)]) {
          delete state.feedback[MAKE.changeKey(client, post.post)];
          MAKE.clearChanges(client, post.post).catch(e => logError("clear changes: " + e.message));
        }
        at++; show();
      } catch (e) { yes.disabled = no.disabled = false; fail(e, "Show to Client"); }
    };
    no.onclick = () => {
      bottom.innerHTML = "";
      const note = $(`<textarea class="text" rows="3" placeholder="What would you like changed?"></textarea>`);
      const back = $(`<button class="btn ghost">Back</button>`), send = $(`<button class="btn">Send</button>`);
      const wrap = $(`<div style="flex:1;display:flex;flex-direction:column;gap:10px"></div>`), row = $(`<div class="row2" style="margin:0"></div>`);
      row.append(back, send); wrap.append(note, row); bottom.append(wrap); note.focus();
      back.onclick = show;
      send.onclick = async () => {
        send.disabled = true; send.textContent = "Saving...";
        try {
          await MAKE.askChanges(client, post.post, post.name, note.value);
          state.feedback = state.feedback || {};
          state.feedback[MAKE.changeKey(client, post.post)] = { day: new Date().toISOString().slice(0, 10), post: post.name, note: note.value.trim() };
          changes++; at++; show();
        } catch (e) { send.disabled = false; send.textContent = "Send"; fail(e, "Show to Client"); }
      };
    };
  };
  show();
}
