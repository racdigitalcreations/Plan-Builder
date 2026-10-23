// Plan Builder for iPad: making posts on the iPad itself.
// - Drive writes (folders, JPGs, Caption.txt), with the same Google sign-in the rest of the app uses
// - The AI (Gemini or Claude), called straight from the iPad with the keys saved on this iPad only
// - Carousel slides drawn from the client's Brand Kit, in both sizes (Instagram 4:5 and Facebook / TikTok 9:16)
// The computer's rules apply: only the client's own real photos (never AI pictures), Test mode puts everything
// in <client> / Testing, and posts land in Final Posts / Photo Posts / <size folder> / <post>, like Export does.

const MAKE = (() => {
  const API = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const FOLDER = "application/vnd.google-apps.folder";
  const SIZES = {
    "4:5": { w: 1080, h: 1350, top: 56, bottom: 56, folder: "Instagram 4x5", tag: "IG 4x5" },
    "9:16": { w: 1080, h: 1920, top: 150, bottom: 330, folder: "Facebook TikTok 9x16", tag: "FB 9x16" },  // room for the app's buttons
  };
  const DEFAULT_KIT = { bg: "#F6F1EA", text: "#2B2621", accent: "#7A5230", dark: "#2B2621", head: "", serif: "Garamond",
                        sans: "Century Gothic", logo_pos: "Top left", logo_size: "Medium", emphasis: "Italic", contact: "" };
  const LOGO_SIZES = { Small: 50, Medium: 64, Large: 80, "Extra large": 120 };
  const NO_LOGO = "(no logo)";
  // Fonts that aren't free Google Fonts: the closest free one is used on the iPad (the computer uses the real one)
  const STAND_INS = { "garamond": "EB Garamond", "century gothic": "Questrial", "futura": "Jost", "avenir": "Nunito Sans",
                      "avenir next": "Nunito Sans", "gill sans": "Lato", "helvetica": "Inter", "helvetica neue": "Inter",
                      "calibri": "Carlito", "cambria": "Caladea", "segoe ui": "Open Sans", "baskerville": "Libre Baskerville",
                      "bodoni": "Bodoni Moda", "didot": "Playfair Display", "brush script mt": "Dancing Script",
                      "copperplate": "Cinzel", "trajan pro": "Cinzel", "proxima nova": "Montserrat", "gotham": "Montserrat",
                      "times new roman": "Tinos", "arial": "Arimo", "georgia": "Gelasio", "aptos": "Inter" };
  const MODELS = { claude: "claude-haiku-4-5-20251001",
                   gemini: ["gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite"] };

  // ---------- settings kept on this iPad (never sent anywhere but the AI's own address) ----------
  const local = (k) => { try { return localStorage.getItem("pb_" + k) || ""; } catch (e) { return ""; } };
  const setLocal = (k, v) => { try { v ? localStorage.setItem("pb_" + k, v) : localStorage.removeItem("pb_" + k); } catch (e) {} };

  let shared = null;                     // the computer's settings (Plan Builder Settings.json), read once per visit
  async function settings(fresh) {
    if (!shared || fresh) {
      try { shared = (await api("api/settings")).settings || {}; } catch (e) { if (e.message === "signin") throw e; shared = {}; }
    }
    return shared;
  }
  const engine = () => local("ai") || ((shared || {}).ai_engine === "claude" ? "claude" : "gemini");
  const testMode = () => local("test") === "1";

  // ---------- Google Drive: writing ----------
  async function signedIn() {         // the Google pass the page saved, or "" when there isn't a fresh one
    const cache = await caches.open("planbuilder-settings");
    const r = await cache.match(new URL("./", location.href).href + "__token");
    const [value, until] = r ? (await r.text()).split(" ") : [];
    return value && Date.now() < Number(until || 0) ? value : "";
  }
  async function token() {
    const value = await signedIn();
    if (!value) { showCode(); throw new Error("signin"); }
    return value;
  }
  async function call(method, url, body, type) {
    for (let attempt = 0; ; attempt++) {
      const headers = { Authorization: "Bearer " + await token() };
      if (type) headers["Content-Type"] = type;
      let res;
      try { res = await fetch(url, { method, headers, body }); }
      catch (e) { throw new Error("Couldn't reach Google Drive. Check the internet connection."); }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise(r => setTimeout(r, 1000 << attempt)); continue; }
      if (res.status === 401) { showCode(); throw new Error("signin"); }
      if (res.status >= 400) {
        let why = await res.text();
        try { why = JSON.parse(why).error.message; } catch (e) {}
        throw new Error("Google Drive said: " + why);
      }
      return res;
    }
  }
  const q = (name) => name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  async function children(parent) {
    const found = [];
    let page = "";
    do {
      const url = API + "?q=" + encodeURIComponent(`'${parent}' in parents and trashed = false`) + "&pageSize=1000&fields="
        + encodeURIComponent("nextPageToken,files(id,name,mimeType)") + (page ? "&pageToken=" + encodeURIComponent(page) : "");
      const data = await (await call("GET", url)).json();
      found.push(...(data.files || []));
      page = data.nextPageToken || "";
    } while (page);
    return found;
  }
  async function findFolder(parent, name) {
    const url = API + "?q=" + encodeURIComponent(`'${parent}' in parents and name = '${q(name)}' and mimeType = '${FOLDER}' and trashed = false`)
      + "&fields=files(id,name)";
    const data = await (await call("GET", url)).json();
    return (data.files || [])[0] || null;
  }
  async function folder(parent, name) {
    const found = await findFolder(parent, name);
    if (found) return found.id;
    const made = await call("POST", API + "?fields=id", JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }), "application/json");
    return (await made.json()).id;
  }
  async function upload(parent, name, blob, type) {
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name, parents: [parent] })], { type: "application/json" }));
    form.append("file", blob instanceof Blob ? blob : new Blob([blob], { type }), name);
    return (await (await call("POST", UPLOAD + "?uploadType=multipart&fields=id", form)).json()).id;
  }
  async function replaceText(fileId, text, type) {
    await call("PATCH", UPLOAD + "/" + encodeURIComponent(fileId) + "?uploadType=media", text, type || "text/plain");
  }
  async function trash(fileId) {
    await call("PATCH", API + "/" + encodeURIComponent(fileId), JSON.stringify({ trashed: true }), "application/json");
  }
  async function rootId() {
    const name = (typeof rootName === "function" ? rootName() : "") || "RAC Clients";
    const url = API + "?q=" + encodeURIComponent(`name = '${q(name)}' and mimeType = '${FOLDER}' and trashed = false`) + "&fields=files(id)";
    const found = ((await (await call("GET", url)).json()).files || [])[0];
    if (!found) throw new Error(`Couldn't find a folder named '${name}' in your Google Drive.`);
    return found.id;
  }
  async function clientId(client) {
    const found = await findFolder(await rootId(), client);
    if (!found) throw new Error("No client folder named " + client + ".");
    return found.id;
  }
  function refreshed() { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage("reset"); }

  /** New photos from the iPad go in <client> / Raw Photos / <today> From iPad, where Create Posts finds them. */
  async function addPhotos(client, files, say) {
    const raw = await folder(await clientId(client), "Raw Photos");
    const day = await folder(raw, today() + " From iPad");
    const made = [];
    for (let i = 0; i < files.length; i++) {
      say && say(`Uploading photo ${i + 1} of ${files.length}...`);
      const f = files[i];
      const name = f.name && !/^image\.(jpe?g|png|heic)$/i.test(f.name) ? f.name : `iPad ${today()} ${stamp()}-${i + 1}.jpg`;
      const data = new Blob([await f.arrayBuffer()], { type: f.type || "image/jpeg" });   // read first: some uploads drop file-backed parts
      made.push({ id: await upload(day, name, data, f.type || "image/jpeg"), name, path: `Raw Photos/${today()} From iPad/${name}`,
                  folder: `Raw Photos/${today()} From iPad`, type: f.type || "image/jpeg", made: new Date().toISOString() });
    }
    refreshed();
    return made;
  }

  // ---------- small helpers ----------
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const stamp = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0"); };
  const safeName = (name) => String(name || "Post").replace(/[\\/:*?"<>|#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Post";
  function loadImage(src) {
    return new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = () => fail(new Error("A photo couldn't be loaded from Google Drive."));
      img.src = src;
    });
  }
  const photoUrl = (id, big) => "api/file?id=" + encodeURIComponent(id) + (big ? "&big=1" : "&small=1");
  async function smallJpeg(source, longest) {          // a photo shrunk for the AI to look at (base64 JPEG)
    const img = source instanceof Blob ? await createImageBitmap(source) : await loadImage(source);
    const scale = Math.min(1, longest / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8).split(",")[1];
  }

  // ---------- the AI ----------
  class Refused extends Error {}
  async function ask(prompt, images, maxTokens) {
    const which = engine();
    const key = local(which === "claude" ? "claude_key" : "gemini_key");
    const name = which === "claude" ? "Claude" : "Gemini";
    if (!key) throw new Error(`Add your ${name} key first: tap the gear at the top of the Clients screen.`);
    return which === "claude" ? askClaude(key, prompt, images, maxTokens) : askGemini(key, prompt, images, maxTokens);
  }
  async function askClaude(key, prompt, images, maxTokens) {
    const content = [];
    for (const image of images) {
      content.push({ type: "text", text: image.label });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.data } });
    }
    content.push({ type: "text", text: prompt });
    const models = [...new Set([(shared || {}).claude_model || MODELS.claude, MODELS.claude])];
    let last = "";
    for (const model of models) {
      let res;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json",
                     "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model, max_tokens: maxTokens || 8000, messages: [{ role: "user", content }] }) });
      } catch (e) { throw new Error("Couldn't reach Claude. Check the internet connection."); }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.stop_reason === "refusal") throw new Refused("Claude wouldn't make posts from these photos.");
        return (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      }
      last = (data.error && data.error.message) || ("error " + res.status);
      if (res.status === 401) throw new Error("Claude didn't accept the key. Check it under the gear (Settings).");
      if (res.status === 400 && /credit|billing/i.test(last)) throw new Error("Claude says the account is out of credit: " + last);
      if (res.status !== 404) break;
    }
    throw new Error("Claude said: " + last);
  }
  let geminiModel = "";
  async function geminiModels(key) {
    if (geminiModel) return [geminiModel, ...MODELS.gemini.filter(m => m !== geminiModel)];
    const chosen = (shared || {}).gemini_model;
    if (chosen) return [chosen, ...MODELS.gemini.filter(m => m !== chosen)];
    try {        // the newest "gemini-N-flash" this key can use, like the computer picks it
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + encodeURIComponent(key));
      const names = ((await res.json()).models || []).map(m => (m.name || "").replace("models/", ""));
      const flash = names.map(n => [n, n.match(/^gemini-(\d+(?:\.\d+)?)-flash$/)]).filter(x => x[1])
        .sort((a, b) => Number(b[1][1]) - Number(a[1][1]));
      if (flash.length) return [flash[0][0], ...MODELS.gemini.filter(m => m !== flash[0][0])];
    } catch (e) {}
    return MODELS.gemini;
  }
  async function askGemini(key, prompt, images, maxTokens) {
    const parts = [];
    for (const image of images) { parts.push({ text: image.label }); parts.push({ inline_data: { mime_type: "image/jpeg", data: image.data } }); }
    parts.push({ text: prompt });
    let last = "";
    for (const model of await geminiModels(key)) {
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + encodeURIComponent(key), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: maxTokens || 8000,
                                                                                          responseMimeType: "application/json" } }) });
      } catch (e) { throw new Error("Couldn't reach Gemini. Check the internet connection."); }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const blocked = (data.promptFeedback || {}).blockReason;
        const cand = (data.candidates || [])[0] || {};
        const text = ((cand.content || {}).parts || []).map(p => p.text || "").join("");
        if (blocked || (!text && /SAFETY|PROHIBITED|BLOCK|RECITATION|OTHER/.test(cand.finishReason || ""))) {
          throw new Refused("Gemini wouldn't make posts from these photos. It often refuses photos of children: switch the AI to Claude and try again.");
        }
        if (text) { geminiModel = model; return text; }
        last = "an empty answer";
        continue;
      }
      last = (data.error && data.error.message) || ("error " + res.status);
      if (res.status === 400 && /API key/i.test(last)) throw new Error("Gemini didn't accept the key. Check it under the gear (Settings).");
      if (res.status === 429) throw new Error("Gemini's free limit is used up for now. Try again later, or switch the AI to Claude.");
    }
    throw new Error("Gemini said: " + last);
  }
  function readJson(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw new Error("The AI's answer couldn't be read. Tap Make Posts to try again.");
  }

  // ---------- what the AI is told (the computer's copy rules) ----------
  const BODY_RULES = {
    short: "Body text: one short sentence, 140 characters or less.",
    medium: "Body text: 2 sentences, 160 to 260 characters, that teach one concrete thing (the why or the how). Every slide needs a body (the hook gets one short sentence that makes people swipe). No headline-only slides.",
    full: "Body text: 3 or 4 sentences, 260 to 400 characters, like a short how-to: the what, the why and one practical tip. Every slide needs a body (the hook gets one short sentence that makes people swipe). No headline-only slides.",
  };
  async function businessInfo(client) {
    const s = await settings();
    const boxes = (s.client_info || {})[client] || {}, kit = brandKit(client);
    const info = [`Business name: ${client}`];
    const about = ((s.inspiration || {})[client] || {}).about;
    if (about) info.push("What they do and where: " + about);
    if (boxes.website) info.push("Website: " + boxes.website);
    if (boxes.notes) info.push("Notes from the agency: " + boxes.notes);
    try { const plan = (await api("api/strategy?client=" + encodeURIComponent(client))).text; if (plan) info.push("THEIR SOCIAL MEDIA STRATEGY (voice, pillars, hashtags):\n" + plan); }
    catch (e) { if (e.message === "signin") throw e; }
    if (kit.contact) info.push("Their contact line (use it exactly as written, it's checked): " + kit.contact);
    try { const extra = (await notes(client)).trim(); if (extra) info.push("MORE NOTES FROM THE AGENCY (newest first):\n" + extra.slice(0, 3000)); }
    catch (e) { if (e.message === "signin") throw e; }
    return info.join("\n");
  }
  function planPrompt(client, count, photos, amount, note, info, least) {
    return `You are the social media designer and copywriter at R.A.C. Digital Creations. Make ${count} carousel post${count > 1 ? "s" : ""} for our client ${client}, from their own photos attached above (labeled Photo 1 to Photo ${photos.length}).
${note ? "WHAT THESE POSTS ARE ABOUT (from the agency): " + note + "\n" : ""}
Each carousel: ${least} to 8 slides, never fewer than ${least}. Use only the attached photos (by number) - never ask for or describe other pictures. Spread the photos over the posts${count > 1 ? " (each post its own photos when there are enough)" : ""}.
Slide layouts you can use (vary them - don't repeat one layout back to back):
hook (big photo, headline - always slide 1), statement (bold headline on dark, optional photo),
split (headline and body beside a tall photo), tip (photo on top, a helpful tip below),
numbered (needs "num": 1, 2, 3... for steps or reasons), checklist (needs "items": 4 to 6 very short list items),
quote (only a REAL quote or review from the business info, with "label" for who said it),
cta (always the last slide; "button" is 1 to 3 words like "Book now").
Copy rules (from our carousel style guide):
- Slide 1 is the hook: a short headline that makes people stop and swipe. The last slide is the call to action.
- Headlines: 45 characters or less. Put ONE or two key words in *asterisks* - they stand out.
- ${BODY_RULES[amount] || BODY_RULES.medium} Optional "eyebrow": 1 to 3 words shown small above the headline.
- Be specific, not generic: use the real names, credentials, training, services, places, numbers and quotes from the business info. Each slide should teach one concrete thing, so the carousel tells a little story from hook to call to action.
- Never invent facts, prices, awards, reviews, years of experience, credentials or quotes. Only use what the business info and photos show. Put anything to check in [square brackets].
- For photographers, never name the people in the photos (their clients).
- If the business works with children or health: no promises of results, no client stories, warm and educational.
With each carousel also write what goes with it when it's posted:
- tagline: one scroll-stopping first line (under 125 characters).
- caption: 2 to 5 short lines in the business's own voice that add to the slides (don't just repeat them), ending with a clear call to action (book, call, visit, DM, link in bio) and their contact line, exactly as written (when there is one).
- hashtags: 8 to 12 hashtags on one line: a few local ones, several niche ones for their field, one branded tag if it fits. Each hashtag is ONE word with no spaces. Only tag services they really offer. No spammy tags (#like4like, #follow, #instagood).
- alt: one plain sentence per slide describing it, for people using screen readers.

Answer with JSON only, exactly like this:
{"posts": [{"title": "Post name, 2 to 6 words (it names the folder)",
  "slides": [{"layout": "hook", "eyebrow": "Fresh daily", "title": "Bread worth *waking up* for", "body": "One short line.", "photo": 1},
             {"layout": "split", "title": "Shaped *by hand*", "body": "...", "photo": 2},
             {"layout": "numbered", "num": 1, "title": "Order *ahead*", "body": "...", "photo": 3},
             {"layout": "checklist", "title": "What to *bring*", "items": ["...", "..."]},
             {"layout": "cta", "title": "Stop in *this week*", "body": "Open daily 7am to 3pm.", "button": "Visit us"}],
  "tagline": "...", "caption": "...", "hashtags": "#One #Two", "alt": ["Slide 1: ...", "Slide 2: ..."]}],
 "tips": "2 or 3 short posting tips for this business and these posts: which to post first and the best days and times."}

BUSINESS INFORMATION:
${info}`;
  }

  /** Ask the AI for the posts. photos: [{id, name}] from the client's Drive. Returns {posts, tips, engine}. */
  async function plan(client, photos, options, say) {
    await settings();
    say(`Getting ${client}'s business info and strategy...`);
    const info = await businessInfo(client);
    const images = [];
    for (let i = 0; i < photos.length; i++) {
      say(`Getting photo ${i + 1} of ${photos.length} ready for the AI...`);
      images.push({ label: `Photo ${i + 1} (${photos[i].name})`, data: await smallJpeg(photoUrl(photos[i].id, false), 768) });
    }
    const least = Math.max(4, Math.min(8, Number(((shared || {}).carousel_count || "").toString().match(/\d+/)?.[0]) || 5));
    const name = engine() === "claude" ? "Claude" : "Gemini";
    say(`${name} is planning ${options.count} post${options.count > 1 ? "s" : ""} and writing the captions...`);
    const answer = readJson(await ask(planPrompt(client, options.count, photos, options.words, options.note, info, least), images, 12000));
    const posts = (answer.posts || []).filter(p => p && Array.isArray(p.slides) && p.slides.length);
    if (!posts.length) throw new Error("The AI didn't send back any posts. Tap Make Posts to try again.");
    const kit = brandKit(client), used = new Set();
    for (const post of posts) {
      post.title = safeName(post.title || "New post");
      post.slides = post.slides.slice(0, 10).map((s, i, all) => {
        const slide = { layout: s.layout || (i === 0 ? "hook" : i === all.length - 1 ? "cta" : "split"),
                        eyebrow: s.eyebrow || "", title: s.title || "", body: s.body || "", num: s.num || "",
                        items: Array.isArray(s.items) ? s.items.slice(0, 6) : [], label: s.label || "", button: s.button || "" };
        const n = Number(s.photo);
        if (n >= 1 && n <= photos.length) { slide.photo = { id: photos[n - 1].id, name: photos[n - 1].name }; used.add(n); }
        return slide;
      });
      post.slides[0].layout = "hook";
      post.slides[post.slides.length - 1].layout = "cta";
      const free = photos.filter((p, i) => !used.has(i + 1));        // a hook always gets a photo
      if (!post.slides[0].photo) post.slides[0].photo = free.shift() || photos[0];
      for (const s of post.slides) if (["hook", "split", "tip"].includes(s.layout) && !s.photo) s.photo = free.shift() || photos[0];
      post.caption = withContact(String(post.caption || ""), kit.contact);
      post.hashtags = fixHashtags(post.hashtags);
      post.alt = Array.isArray(post.alt) ? post.alt.map(String) : [];
      post.tagline = String(post.tagline || "");
    }
    return { posts, tips: String(answer.tips || ""), engine: name };
  }

  /** A new caption for a finished post: from its slides (JPGs) and what you want changed. */
  async function rewriteCaption(client, title, slideIds, current, note, say) {
    await settings();
    say(`Getting ${client}'s business info...`);
    const info = await businessInfo(client);
    const images = [];
    for (let i = 0; i < Math.min(slideIds.length, 8); i++) {
      say(`Reading slide ${i + 1}...`);
      images.push({ label: `Slide ${i + 1} of the carousel '${title}'`, data: await smallJpeg(photoUrl(slideIds[i], false), 768) });
    }
    say((engine() === "claude" ? "Claude" : "Gemini") + " is rewriting the caption...");
    const answer = readJson(await ask(`You are the social media copywriter at R.A.C. Digital Creations. Rewrite what goes with this finished carousel for our client ${client} when it's posted. Its slides are attached above.
THE CURRENT CAPTION:
${current || "(none yet)"}
${note ? "WHAT TO CHANGE (from the agency): " + note : "Make it better: more specific, in their voice, with a clear call to action."}
Rules: a tagline under 125 characters; a caption of 2 to 5 short lines ending with a call to action and their contact line exactly as written (when there is one); 8 to 12 one-word hashtags (no spaces, only services they offer, no spammy tags); one alt text sentence per slide. Never invent prices, results, reviews, awards, years of experience or credentials; put anything to check in [square brackets].
Answer with JSON only: {"tagline": "...", "caption": "...", "hashtags": "#One #Two", "alt": ["Slide 1: ...", "Slide 2: ..."]}

BUSINESS INFORMATION:
${info}`, images, 3000));
    const kit = brandKit(client);
    return captionText(title, { tagline: answer.tagline || "", caption: withContact(String(answer.caption || ""), kit.contact),
                                hashtags: fixHashtags(answer.hashtags), alt: Array.isArray(answer.alt) ? answer.alt : [] });
  }

  function fixHashtags(tags) {
    const list = (Array.isArray(tags) ? tags.join(" ") : String(tags || "")).split(/[\s,]+(?=#)|\s+#/).map(t => t.trim()).filter(Boolean);
    return [...new Set(list.map(t => "#" + t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter(t => t.length > 1))].join(" ");
  }
  function withContact(caption, contact) {
    if (!contact || caption.toLowerCase().includes(contact.trim().toLowerCase())) return caption.trim();
    return caption.trim() + "\n" + contact.trim();
  }
  /** The Caption.txt the computer writes: the post's name, tagline, caption, hashtags and alt text. */
  function captionText(title, post, tips) {
    let text = `${title}\n\nTagline: ${post.tagline || ""}\nCaption:\n${(post.caption || "").trim()}\nHashtags: ${post.hashtags || ""}\nAlt text:\n`;
    text += (post.alt || []).map((a, i) => /^slide\s*\d+/i.test(a) ? a : `Slide ${i + 1}: ${a}`).join("\n") + "\n";
    if (tips) text += `\nPOSTING TIPS (for the whole set)\n${tips.trim()}\n`;
    return text;
  }

  // ---------- the Brand Kit ----------
  function brandKit(client) {
    const s = shared || {};
    const kit = Object.assign({}, DEFAULT_KIT);
    for (const [k, v] of Object.entries((s.brand_kits || {})[client] || {})) if (v) kit[k] = v;
    if (!(s.brand_kits || {})[client]) {
      const font = (s.fonts || {})[client];
      if (font) kit.serif = font;
    }
    return kit;
  }
  /** The client's logo: the one picked in their Brand Kit on the computer, else a file named like a logo. */
  function logoFor(client, photos) {
    const s = shared || {};
    const picked = (s.logos || {})[client], stored = (s.logo_files || {})[client];
    if (picked === NO_LOGO) return null;
    if (stored && stored.id && (!picked || stored.path === picked)) return stored.id;
    const byPath = picked && photos.find(p => p.path === picked);
    if (byPath) return byPath.id;
    const likely = photos.filter(p => /logo|brand/i.test(p.path));
    likely.sort((a, b) => (!/transparent|see.?through/i.test(a.path)) - (!/transparent|see.?through/i.test(b.path))
      || (!a.path.toLowerCase().endsWith(".png")) - (!b.path.toLowerCase().endsWith(".png")) || (!/logo/i.test(a.path)) - (!/logo/i.test(b.path)));
    return likely.length ? likely[0].id : null;
  }

  // ---------- colors (the same readability fixes as the computer) ----------
  const hex = (v) => { v = String(v || "").trim().replace("#", "").toUpperCase(); if (v.length === 3) v = v.split("").map(c => c + c).join(""); return /^[0-9A-F]{6}$/.test(v) ? v : null; };
  const rgbOf = (h) => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  function lum(h) { return rgbOf(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
                                 .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => toHex(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
  function readable(color, back, ratio) {
    if (contrast(color, back) >= ratio) return color;
    const toward = lum(back) > 0.4 ? "000000" : "FFFFFF";
    for (let t = 0.1; t <= 1; t += 0.1) { const c = mix(color, toward, t); if (contrast(c, back) >= ratio) return c; }
    return toward;
  }
  function palette(kit) {
    const bg = hex(kit.bg) || "F6F1EA";
    const exact = (c, back) => contrast(c, back) >= 3 ? c : readable(c, back, 4.5);
    const ink = exact(hex(kit.text) || "2B2621", bg), head = exact(hex(kit.head) || ink, bg);
    const accent = readable(hex(kit.accent) || "7A5230", bg, 3.5);
    let dark = hex(kit.dark) || ink, darkInk = hex(kit.dark_text) || bg;
    if (contrast(dark, darkInk) < 3) {
      if (lum(dark) > 0.45) dark = mix(dark, "000000", 0.6);
      if (contrast(dark, bg) < 4.5) dark = readable(dark, bg, 4.5);
      darkInk = readable(darkInk, dark, 4.5);
    }
    const accentOnDark = readable(lum(accent) < 0.55 ? mix(accent, "FFFFFF", 0.45) : accent, dark, 3);
    const c = (h) => "#" + h;
    return { bg: c(bg), ink: c(ink), head: c(head), accent: c(accent), dark: c(dark), darkInk: c(darkInk),
             accentOnDark: c(accentOnDark), buttonInk: c(readable(bg, accent, 4.5)), muted: c(mix(ink, bg, 0.25)) };
  }

  // ---------- fonts: the Brand Kit's, from Google Fonts (a free stand-in when it isn't one) ----------
  const fontReady = new Map();
  async function googleFont(family) {
    const name = family.trim().replace(/\s+/g, "+");
    for (const styles of [":ital,wght@0,400;0,700;1,400;1,700", ":wght@400;700", ""]) {
      try {
        const res = await fetch(`https://fonts.googleapis.com/css2?family=${name}${styles}&display=block`);
        if (!res.ok) continue;
        const css = await res.text();
        const style = document.createElement("style"); style.textContent = css; document.head.append(style);
        await Promise.all(["400", "700", "italic 400", "italic 700"].map(w => document.fonts.load(`${w} 40px "${family}"`).catch(() => {})));
        return true;
      } catch (e) {}
    }
    return false;
  }
  /** The family name to draw with, and whether it's a stand-in. */
  async function font(family, serif) {
    family = (family || "").trim();
    const key = family.toLowerCase() + (serif ? "|s" : "|n");
    if (!fontReady.has(key)) {
      fontReady.set(key, (async () => {
        if (family && await googleFont(family)) return { family, standIn: "" };
        const other = STAND_INS[family.toLowerCase()];
        if (other && await googleFont(other)) return { family: other, standIn: family };
        const plain = serif ? "Georgia" : "Helvetica Neue";
        return { family: plain, standIn: family };
      })());
    }
    return fontReady.get(key);
  }

  // ---------- drawing ----------
  function runsOf(text) {            // 'Fresh bread *every morning*' -> words, each marked when it stands out
    const words = [];
    String(text || "").split(/(\*[^*]+\*)/).forEach(part => {
      const em = /^\*[^*]+\*$/.test(part);
      part.replace(/\*/g, "").split(/\s+/).filter(Boolean).forEach(t => words.push({ t, em }));
    });
    return words;
  }
  function fontString(f, size, weight, italic) { return `${italic ? "italic " : ""}${weight} ${size}px "${f.family}", ${f.generic}`; }
  /** Wrap text into lines of at most width; shrinks the size (down to min) until it fits in maxLines. */
  function wrap(ctx, text, f, size, min, width, maxLines, weight, emStyle) {
    const words = runsOf(text);
    for (let s = size; ; s = Math.max(min, s - 4)) {
      const lines = [[]];
      let x = 0;
      for (const word of words) {
        const italic = word.em && emStyle === "Italic", bold = word.em && emStyle === "Bold";
        ctx.font = fontString(f, s, bold ? 700 : weight, italic);
        const w = ctx.measureText(word.t).width, space = ctx.measureText(" ").width;
        if (x && x + space + w > width) { lines.push([]); x = 0; }
        lines[lines.length - 1].push({ ...word, w, italic, bold, gap: x ? space : 0 });
        x += (x ? space : 0) + w;
      }
      if (lines.length <= maxLines || s === min) {
        if (lines.length > maxLines) { lines.length = maxLines; const last = lines[maxLines - 1]; if (last.length) last[last.length - 1].more = "…"; }
        return { lines, size: s, weight, f };
      }
    }
  }
  function lineWidth(line) { return line.reduce((a, r) => a + r.gap + r.w, 0); }
  /** Draw wrapped text. Returns the y under the last line. */
  function drawWrapped(ctx, block, x, y, align, color, emColor, lineGap) {
    const h = Math.round(block.size * (lineGap || 1.15));
    ctx.textBaseline = "alphabetic";
    for (const line of block.lines) {
      let cx = align === "center" ? x - lineWidth(line) / 2 : x;
      y += h;
      for (const r of line) {
        cx += r.gap;
        ctx.font = fontString(block.f, block.size, r.bold ? 700 : block.weight, r.italic);
        ctx.fillStyle = r.em ? emColor : color;
        ctx.fillText(r.t + (r.more || ""), cx, y - h * 0.22);
        cx += r.w;
      }
    }
    return y;
  }
  function textHeight(block, lineGap) { return block.lines.length * Math.round(block.size * (lineGap || 1.15)); }
  function cover(ctx, img, x, y, w, h) {
    if (!img) { ctx.fillStyle = "#888"; ctx.fillRect(x, y, w, h); return; }
    const scale = Math.max(w / img.width, h / img.height), sw = w / scale, sh = h / scale;
    const sx = (img.width - sw) / 2, sy = Math.max(0, Math.min(img.height - sh, (img.height - sh) * 0.4));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function eyebrow(ctx, text, f, x, y, color, align) {
    if (!text) return y;
    ctx.font = fontString(f, 30, 700, false);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
    ctx.fillStyle = color; ctx.textAlign = align === "center" ? "center" : "left";
    ctx.fillText(String(text).toUpperCase(), x, y + 30);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
    return y + 54;
  }
  function logo(ctx, B, size, onPhoto, place) {
    const pos = place || B.kit.logo_pos || "Top left";
    if (pos === "None") return;
    const h = LOGO_SIZES[B.kit.logo_size] || 64, inset = 40;
    let w, draw;
    if (B.logo) { w = Math.min(h * 6, h * B.logo.width / B.logo.height); draw = (x, y) => ctx.drawImage(B.logo, x, y, w, h); }
    else {       // no logo: the business name in spaced caps
      ctx.font = fontString(B.sans, Math.round(h * 0.42), 700, false);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
      w = ctx.measureText(B.client.toUpperCase()).width;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      draw = (x, y, color) => { ctx.font = fontString(B.sans, Math.round(h * 0.42), 700, false); if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
                                ctx.fillStyle = color; ctx.fillText(B.client.toUpperCase(), x, y + h * 0.66); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; };
    }
    const top = size.top === 56 ? inset : size.top;
    let x = pos === "Top right" ? size.w - inset - w : pos.includes("center") ? (size.w - w) / 2 : inset;
    let y = pos === "Bottom center" ? size.h - size.bottom - h - 10 : top;
    const pad = onPhoto ? 16 : 0;
    if (pos === "Top left") x += pad; else if (pos === "Top right") x -= pad;
    if (pos !== "Bottom center") y += pad;
    if (onPhoto) {               // a small card behind it, so it reads on any photo
      ctx.fillStyle = B.p.bg; ctx.beginPath(); ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 14); ctx.fill();
    }
    draw(x, y, onPhoto ? B.p.head : B.p.head);
  }
  function swipeHint(ctx, B, size, color) {
    ctx.font = fontString(B.sans, 28, 700, false); ctx.fillStyle = color; ctx.textAlign = "right";
    ctx.fillText("Swipe  →", size.w - 56, size.h - size.bottom - 4); ctx.textAlign = "left";
  }

  /** One slide on a canvas. B: {kit, p (colors), head, sans (fonts), logo, client}. photo: the loaded picture. */
  function drawSlide(slide, index, total, B, sizeKey, photo) {
    const size = SIZES[sizeKey], W = size.w, H = size.h, M = 72;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"), p = B.p, em = B.kit.emphasis === "Bold" ? "Bold" : "Italic";
    const tall = sizeKey === "9:16";
    const bottom = H - size.bottom - 30, textW = W - M * 2;
    const titleOf = (text, big, lines, width) => wrap(ctx, text, B.head, big, Math.round(big * 0.6), width || textW, lines, 700, em);
    const bodyOf = (text, sz, lines, width) => wrap(ctx, text, B.sans, sz, 26, width || textW, lines, 400, "none");
    const layout = slide.layout;
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);

    if (layout === "hook") {
      cover(ctx, photo, 0, 0, W, H);
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,.8)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const t = titleOf(slide.title, tall ? 108 : 96, 4), b = bodyOf(slide.body, tall ? 44 : 38, 3);
      let y = bottom - 60 - textHeight(t, 1.08) - (slide.body ? textHeight(b, 1.3) + 22 : 0) - (slide.eyebrow ? 54 : 0);
      y = eyebrow(ctx, slide.eyebrow, B.sans, M, y, "#FFFFFF");
      y = drawWrapped(ctx, t, M, y, "left", "#FFFFFF", "#FFFFFF", 1.08);
      if (slide.body) drawWrapped(ctx, b, M, y + 22, "left", "rgba(255,255,255,.9)", "#FFFFFF", 1.3);
      swipeHint(ctx, B, size, "rgba(255,255,255,.85)");
      logo(ctx, B, size, true);
      return c;
    }
    if (layout === "cta") {
      ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H);
      if (photo) { ctx.globalAlpha = 0.22; cover(ctx, photo, 0, 0, W, H); ctx.globalAlpha = 1; }
      const t = titleOf(slide.title, tall ? 100 : 88, 3, textW), b = bodyOf(slide.body, tall ? 44 : 38, 4);
      const lh = Math.round(Math.min(150, (LOGO_SIZES[B.kit.logo_size] || 64) * 1.8));
      const button = (slide.button || "").trim();
      const block = lh + 50 + textHeight(t, 1.1) + (slide.body ? textHeight(b, 1.3) + 26 : 0) + (button ? 130 : 0);
      let y = Math.max(size.top + 40, (size.top + bottom - block) / 2);
      if (B.logo) {
        const w = Math.min(W - 2 * M, lh * B.logo.width / B.logo.height), x = (W - w) / 2, pad = 22;
        ctx.fillStyle = p.bg; ctx.beginPath(); ctx.roundRect(x - pad, y - pad, w + pad * 2, lh + pad * 2, 20); ctx.fill();
        ctx.drawImage(B.logo, x, y, w, lh);
      } else {
        ctx.font = fontString(B.sans, 40, 700, false); ctx.fillStyle = p.accentOnDark; ctx.textAlign = "center";
        ctx.fillText(B.client.toUpperCase(), W / 2, y + lh * 0.6); ctx.textAlign = "left";
      }
      y += lh + 50;
      y = drawWrapped(ctx, t, W / 2, y, "center", p.darkInk, p.accentOnDark, 1.1);
      if (slide.body) y = drawWrapped(ctx, b, W / 2, y + 26, "center", p.darkInk, p.darkInk, 1.3);
      if (button) {
        ctx.font = fontString(B.sans, 38, 700, false);
        const bw = ctx.measureText(button.toUpperCase()).width + 110, bx = (W - bw) / 2, by = y + 44;
        ctx.fillStyle = p.accentOnDark; ctx.beginPath(); ctx.roundRect(bx, by, bw, 92, 46); ctx.fill();
        ctx.fillStyle = p.dark; ctx.textAlign = "center"; ctx.fillText(button.toUpperCase(), W / 2, by + 60); ctx.textAlign = "left";
      }
      return c;
    }
    if (layout === "statement" || layout === "quote") {
      ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H);
      let top = size.top + 150;
      if (photo && layout === "statement") {
        const ph = Math.round(H * 0.42); cover(ctx, photo, 0, 0, W, ph); top = ph + 70;
        logo(ctx, B, size, true);
      } else logo(ctx, B, size, true);
      const quote = layout === "quote";
      const t = titleOf(quote ? `“${String(slide.title).replace(/^["“]|["”]$/g, "")}”` : slide.title, (quote ? 70 : 92) + (tall ? 12 : 0), quote ? 7 : 5);
      const b = bodyOf(slide.body, tall ? 44 : 38, 5);
      const block = (slide.eyebrow ? 54 : 0) + textHeight(t, 1.12) + (slide.body ? textHeight(b, 1.3) + 30 : 0) + (quote ? 140 : 40);
      let y = Math.max(top, (top + bottom - block) / 2);
      if (quote) { ctx.font = fontString(B.head, 200, 700, false); ctx.fillStyle = p.accentOnDark; ctx.fillText("“", M - 8, y + 130); y += 110; }
      else { ctx.fillStyle = p.accentOnDark; ctx.fillRect(M, y, 90, 8); y += 40; }
      y = eyebrow(ctx, slide.eyebrow, B.sans, M, y, p.accentOnDark);
      y = drawWrapped(ctx, t, M, y, "left", p.darkInk, p.accentOnDark, 1.12);
      if (slide.body) y = drawWrapped(ctx, b, M, y + 30, "left", p.darkInk, p.darkInk, 1.3);
      if (quote && slide.label) { ctx.font = fontString(B.sans, 32, 700, false); ctx.fillStyle = p.accentOnDark; ctx.fillText("— " + slide.label, M, y + 60); }
      return c;
    }
    if (layout === "split" && !tall) {             // photo on the left, words on the right
      const pw = Math.round(W * 0.46);
      cover(ctx, photo, 0, 0, pw, H);
      const x = pw + 56, w = W - x - 60;
      const t = titleOf(slide.title, 66, 5, w), b = bodyOf(slide.body, 34, 9, w);
      const block = (slide.eyebrow ? 54 : 0) + textHeight(t, 1.12) + (slide.body ? textHeight(b, 1.35) + 28 : 0);
      let y = Math.max(160, (H - block) / 2);
      y = eyebrow(ctx, slide.eyebrow, B.sans, x, y, p.accent);
      y = drawWrapped(ctx, t, x, y, "left", p.head, p.accent, 1.12);
      if (slide.body) drawWrapped(ctx, b, x, y + 28, "left", p.ink, p.ink, 1.35);
      logo(ctx, B, size, false, B.kit.logo_pos === "None" ? "None" : "Top right");
      return c;
    }
    if (layout === "checklist") {
      let top = size.top + 140;
      if (photo) { const ph = Math.round(H * (tall ? 0.3 : 0.26)); cover(ctx, photo, 0, 0, W, ph); top = ph + 60; logo(ctx, B, size, true); }
      else logo(ctx, B, size, false);
      const t = titleOf(slide.title, tall ? 92 : 80, 3), items = (slide.items || []).filter(Boolean);
      const itemSize = tall ? 48 : 42, lines = items.map(item => bodyOf(item, itemSize, 2, textW - 84));
      const gap = tall ? 44 : 30;
      const listH = lines.reduce((a, l) => a + Math.max(56, textHeight(l, 1.2)) + gap, 0);
      const block = (slide.eyebrow ? 54 : 0) + textHeight(t, 1.12) + 40 + listH;
      let y = Math.max(top, top + (bottom - top - block) / 2);
      y = eyebrow(ctx, slide.eyebrow, B.sans, M, y, p.accent);
      y = drawWrapped(ctx, t, M, y, "left", p.head, p.accent, 1.12) + 40;
      lines.forEach(line => {
        const lh = Math.max(56, textHeight(line, 1.2)), cy = y + lh / 2, r = tall ? 26 : 24;
        ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(M + r, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = p.buttonInk; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(M + r - 11, cy); ctx.lineTo(M + r - 3, cy + 8); ctx.lineTo(M + r + 11, cy - 9); ctx.stroke();
        drawWrapped(ctx, line, M + 84, y + (lh - textHeight(line, 1.2)) / 2, "left", p.ink, p.ink, 1.2);
        y += lh + gap;
      });
      if (slide.body && !items.length) drawWrapped(ctx, bodyOf(slide.body, tall ? 44 : 38, 6), M, y, "left", p.ink, p.ink, 1.3);
      return c;
    }
    // tip, numbered, and split on the tall size: the photo on top, the words below
    const ph = photo ? Math.round(H * (tall ? 0.5 : 0.52)) : 0;
    if (photo) cover(ctx, photo, 0, 0, W, ph);
    logo(ctx, B, size, !!photo);
    let y = ph ? ph + 56 : size.top + 160;
    if (layout === "numbered" && slide.num !== "" && slide.num != null) {
      const r = 62, cy = ph ? ph : y + r;
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(W - M - r, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = fontString(B.head, 68, 700, false); ctx.fillStyle = p.buttonInk; ctx.textAlign = "center";
      ctx.fillText(String(slide.num), W - M - r, cy + 24); ctx.textAlign = "left";
      if (!ph) y += 10;
    }
    const space = bottom - y, bodySize = tall ? 46 : 36;
    const t = titleOf(slide.title, tall ? 96 : 76, 3, textW - (layout === "numbered" ? 150 : 0));
    const b = bodyOf(slide.body, bodySize, Math.max(2, Math.floor((space - textHeight(t, 1.12) - 90) / (bodySize * 1.35))));
    const tipWord = slide.eyebrow || (layout === "tip" ? "Tip" : "");
    const block = (tipWord ? 54 : 0) + textHeight(t, 1.12) + (slide.body ? textHeight(b, 1.35) + 24 : 0);
    y = Math.max(y, y + (space - block) / 2 - 40);       // the words sit in the middle of the space under the photo
    y = eyebrow(ctx, tipWord, B.sans, M, y, p.accent);
    y = drawWrapped(ctx, t, M, y, "left", p.head, p.accent, 1.12);
    if (slide.body) drawWrapped(ctx, b, M, y + 24, "left", p.ink, p.ink, 1.35);
    if (index === 0) swipeHint(ctx, B, size, p.muted);
    return c;
  }

  /** Everything drawSlide needs for a client: colors, fonts and logo. notes: fonts that had to be stood in for. */
  async function brand(client, photos) {
    await settings();
    const kit = brandKit(client), p = palette(kit);
    const head = await font(kit.serif, true), sans = await font(kit.sans, false);
    head.generic = "serif"; sans.generic = "sans-serif";
    let logoImg = null;
    const logoId = logoFor(client, photos || []);
    if (logoId) { try { logoImg = await loadImage("api/file?id=" + encodeURIComponent(logoId)); } catch (e) {} }
    const notes = [head.standIn, sans.standIn].filter(Boolean);
    return { kit, p, head, sans, logo: logoImg, client, notes: [...new Set(notes)] };
  }

  const pictures = new Map();
  async function picture(id) {
    if (!pictures.has(id)) pictures.set(id, loadImage(photoUrl(id, true)).catch(e => { pictures.delete(id); throw e; }));
    return pictures.get(id);
  }
  /** Draw a post's slides in one size. Returns canvases. */
  async function render(post, B, sizeKey) {
    const out = [];
    for (let i = 0; i < post.slides.length; i++) {
      const s = post.slides[i];
      const photo = s.photo ? await picture(s.photo.id).catch(() => null) : null;
      out.push(drawSlide(s, i, post.slides.length, B, sizeKey, photo));
    }
    return out;
  }
  const jpeg = (canvas) => new Promise(done => canvas.toBlob(done, "image/jpeg", 0.92));

  /** Save a post to Final Posts / Photo Posts / <size> / <title> (in Testing in Test mode), both sizes.
   *  replacing: the post's own folder ids (remaking it), so its old JPGs are swapped for the new ones. */
  async function save(client, post, B, tips, say, replacing) {
    let home = await clientId(client);
    if (testMode()) home = await folder(home, "Testing");
    const fin = await folder(home, "Final Posts"), photoPosts = await folder(fin, "Photo Posts");
    let title = safeName(post.title);
    if (!replacing) {               // never write over a different post with the same name
      const taken = new Set((await children(await folder(photoPosts, SIZES["4:5"].folder))).map(f => f.name.toLowerCase()));
      for (let n = 2; taken.has(title.toLowerCase()); n++) title = safeName(post.title) + " " + n;
      post.title = title;
    }
    const caption = captionText(title, post, tips);
    const plan = JSON.stringify({ made: "iPad", version: 1, client, title, slides: post.slides, tagline: post.tagline,
                                  caption: post.caption, hashtags: post.hashtags, alt: post.alt, saved: new Date().toISOString() }, null, 1);
    const where = {};
    for (const sizeKey of ["4:5", "9:16"]) {
      const size = SIZES[sizeKey];
      say(`Drawing the ${sizeKey === "4:5" ? "Instagram 4:5" : "Facebook / TikTok 9:16"} slides...`);
      const canvases = await render(post, B, sizeKey);
      const target = (replacing && replacing[sizeKey]) || await folder(await folder(photoPosts, size.folder), title);
      const old = await children(target);
      for (const f of old) {          // a remake replaces the JPGs, the caption and the slide plan
        const n = f.name.toLowerCase();
        if ((f.mimeType || "").startsWith("image/") || n.endsWith("caption.txt") || n.endsWith("slides.json")) await trash(f.id).catch(() => {});
      }
      for (let i = 0; i < canvases.length; i++) {
        say(`Saving slide ${i + 1} of ${canvases.length} (${sizeKey})...`);
        await upload(target, `${title} - ${String(i + 1).padStart(2, "0")} - ${size.tag}.jpg`, await jpeg(canvases[i]), "image/jpeg");
      }
      await upload(target, `${title} - Caption.txt`, new Blob([caption], { type: "text/plain" }), "text/plain");
      await upload(target, `${title} - Slides.json`, new Blob([plan], { type: "application/json" }), "application/json");
      where[sizeKey] = target;
    }
    refreshed();
    return { title, where };
  }

  async function saveCaption(fileId, folderId, title, text) {
    if (fileId) await replaceText(fileId, text, "text/plain");
    else if (folderId) await upload(folderId, `${title} - Caption.txt`, new Blob([text], { type: "text/plain" }), "text/plain");
    refreshed();
  }

  // ---------- the error log in Drive: "Plan Builder iPad - error_log.txt" in the main folder ----------
  let logging = Promise.resolve();
  function logToDrive(line) {
    logging = logging.then(async () => {
      try {
        if (!await signedIn()) return;
        const root = await rootId(), name = "Plan Builder iPad - error_log.txt";
        const url = API + "?q=" + encodeURIComponent(`'${root}' in parents and name = '${q(name)}' and trashed = false`) + "&fields=files(id)";
        const found = ((await (await call("GET", url)).json()).files || [])[0];
        if (found) {
          const old = await (await call("GET", API + "/" + found.id + "?alt=media")).text();
          await replaceText(found.id, (old + line + "\n").slice(-200000));
        } else await upload(root, name, new Blob([line + "\n"], { type: "text/plain" }), "text/plain");
      } catch (e) {}
    });
  }

  // ---------- decks: posting JPGs from a PowerPoint deck (edited in PowerPoint on the iPad, or made on the computer) ----------
  // Google turns a copy of the deck into Google Slides and hands back a PDF; the iPad draws each page as a 1080-wide JPG.
  // (The same converter the computer uses when PowerPoint isn't there, so fonts can look a little different.)
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  async function pdfReader() {                     // loaded only when needed, so the app stays quick
    if (!window.pdfjsLib) {
      await new Promise((done, fail) => {
        const tag = document.createElement("script");
        tag.src = PDFJS + "pdf.min.js"; tag.onload = done;
        tag.onerror = () => fail(new Error("Couldn't load the PDF reader. Check the internet connection."));
        document.head.append(tag);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    }
    return window.pdfjsLib;
  }
  /** Draw a deck's slides: [canvas] at the posting size (4:5 or 9:16, from the slide shape). */
  async function deckSlides(deck, say) {
    say("Google is reading the deck...");
    const copy = await (await call("POST", API + "/" + encodeURIComponent(deck.id) + "/copy?fields=id",
      JSON.stringify({ name: "Plan Builder iPad - temporary copy - " + deck.name, mimeType: "application/vnd.google-apps.presentation" }),
      "application/json")).json();
    let data;
    try { data = await (await call("GET", API + "/" + encodeURIComponent(copy.id) + "/export?mimeType=application/pdf")).arrayBuffer(); }
    finally { await call("DELETE", API + "/" + encodeURIComponent(copy.id)).catch(() => {}); }   // the temporary copy only
    const lib = await pdfReader();
    const doc = await lib.getDocument({ data }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      say(`Drawing slide ${i} of ${doc.numPages}...`);
      const page = await doc.getPage(i), plain = page.getViewport({ scale: 1 });
      const sizeKey = plain.height / plain.width > 1.5 ? "9:16" : "4:5", size = SIZES[sizeKey];
      const scale = size.w / plain.width, view = page.getViewport({ scale });
      const drawn = document.createElement("canvas");
      drawn.width = size.w; drawn.height = Math.round(view.height);
      await page.render({ canvasContext: drawn.getContext("2d"), viewport: view }).promise;
      const c = document.createElement("canvas"); c.width = size.w; c.height = size.h;       // exactly 1080x1350 or 1080x1920
      const ctx = c.getContext("2d"); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(drawn, 0, (size.h - drawn.height) / 2);
      c.sizeKey = sizeKey;
      out.push(c);
    }
    if (!out.length) throw new Error("That deck has no slides.");
    return out;
  }
  /** Posting JPGs from a deck into Final Posts / Photo Posts / <size> / <post>, like Export on the computer.
   *  The post's Caption.txt stays; its old JPGs are replaced. test: the deck is in the Testing folder. */
  async function deckToFinal(client, deck, test, say) {
    const canvases = await deckSlides(deck, say);
    const sizeKey = canvases[0].sizeKey, size = SIZES[sizeKey];
    let home = await clientId(client);
    if (test) home = await folder(home, "Testing");
    const title = safeName(deck.post);
    const target = await folder(await folder(await folder(await folder(home, "Final Posts"), "Photo Posts"), size.folder), title);
    for (const f of await children(target)) {
      const n = f.name.toLowerCase();
      if ((f.mimeType || "").startsWith("image/") || n.endsWith("slides.json")) await trash(f.id).catch(() => {});
    }
    for (let i = 0; i < canvases.length; i++) {
      say(`Saving slide ${i + 1} of ${canvases.length}...`);
      await upload(target, `${title} - ${String(i + 1).padStart(2, "0")} - ${size.tag}.jpg`, await jpeg(canvases[i]), "image/jpeg");
    }
    refreshed();
    return { title, count: canvases.length, sizeKey, folderId: target };
  }

  /** A finished post's slides as files, for the Share button (Save to Photos, Instagram, Messages...). */
  async function slideFiles(post, sizeKey) {
    const set = post.sizes[sizeKey];
    const files = [];
    for (let i = 0; i < set.images.length; i++) {
      const r = await fetch("api/file?id=" + encodeURIComponent(set.images[i]));
      if (!r.ok) throw new Error("A slide couldn't be downloaded from Google Drive.");
      const blob = await r.blob();
      files.push(new File([blob], `${safeName(post.name)} - ${String(i + 1).padStart(2, "0")}.jpg`, { type: blob.type || "image/jpeg" }));
    }
    return files;
  }

  // ---------- quick notes about a client: "<client> - iPad Notes", a Google Doc in their Client Info folder ----------
  // (Kept apart from their Client Info doc, which the computer rewrites from its own boxes.) Create Posts reads it too.
  const DOC = "application/vnd.google-apps.document";
  async function notesDoc(client, make) {
    const id = await clientId(client);
    const info = make ? await folder(id, "Client Info") : (await findFolder(id, "Client Info") || {}).id;
    if (!info) return null;
    const name = `${client} - iPad Notes`;
    const url = API + "?q=" + encodeURIComponent(`'${info}' in parents and name = '${q(name)}' and trashed = false`) + "&fields=files(id)";
    const found = ((await (await call("GET", url)).json()).files || [])[0];
    if (found || !make) return found ? found.id : null;
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name, parents: [info], mimeType: DOC })], { type: "application/json" }));
    form.append("file", new Blob([`${client} - iPad Notes\n`], { type: "text/plain" }));
    return (await (await call("POST", UPLOAD + "?uploadType=multipart&fields=id", form)).json()).id;
  }
  async function notes(client) {
    const id = await notesDoc(client, false);
    if (!id) return "";
    const text = await (await call("GET", API + "/" + encodeURIComponent(id) + "/export?mimeType=text/plain")).text();
    return text.replace(/^\uFEFF/, "").replace(new RegExp("^\\s*" + client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " - iPad Notes\\s*", "i"), "").trim();
  }
  /** Add a dated note at the top. Returns the notes' text now. */
  async function addNote(client, text) {
    const id = await notesDoc(client, true);
    const now = (await notes(client)).trim();
    const all = `${client} - iPad Notes\n\n${today()}: ${text.trim()}\n${now ? "\n" + now + "\n" : ""}`;
    await replaceText(id, all, "text/plain");
    return all;
  }
  const docLink = async (client) => { const id = await notesDoc(client, false); return id ? "https://docs.google.com/document/d/" + id + "/edit" : ""; };

  // ---------- documents: Strategy and Pitch Kit (the computer's own prompts, from plan_builder.py) ----------
  const PLAN_PROMPT = `You are an experienced social media strategist helping a small local agency
pitch a new client. Using the business information below, write a practical social media plan.

Include these sections:
1. Business Snapshot - what they do, who their customers are, what makes them different
2. Recommended Platforms - which 2-3 platforms fit best and why
3. Brand Voice - how their posts should sound, with a few example phrases
4. Content Pillars - 4-5 recurring themes for posts, each with 2 post ideas
5. Posting Schedule - how often on each platform
6. Quick Wins - 3 things they could do in the first 30 days
7. Gaps or Questions - anything unclear from their info that we should ask them

Keep it clear and friendly. Avoid jargon. The reader is a small business owner.

BUSINESS INFORMATION:
{business_info}
`;
  const PITCH_PROMPT = `You are a social media strategist at a small local agency, preparing for a pitch
meeting with a potential client. Using the business information below, create a Pitch Kit.

# Pitch Kit

## Sample Posts
Write {num_posts} ready-to-post sample posts in the business's own voice. Mix platforms that fit
the business (Instagram, Facebook, and others if they make sense) and mix post types
(educational, behind-the-scenes, promotional, community, testimonial-style). For each post include:
- **Platform & type**
- **Caption** - ready to copy and paste; use emojis only if they suit the brand
- **Hashtags** - 5 to 10, mixing local and niche tags
- **Visual idea** - the photo, video or graphic that should go with it
- **Why it works** - one sentence on the strategy, to say out loud in the meeting

## Pitch Email
A short, warm email to the business owner (under 150 words), with a subject line.
Mention something specific about their business, the opportunity you see, and offer to
walk them through the sample posts. Sign it as: {signature}

## Talking Points
3 to 5 short points to bring up in the meeting.

Only use facts found in the business information. Never invent reviews, awards, prices,
statistics or client stories; put anything that would need confirming in [square brackets].

BUSINESS INFORMATION:
{business_info}
`;
  const DOC_ANSWER = '\n\nWrite it in Markdown (# and ## headings, - bullets, **bold**). Answer with JSON only: {"doc": "<the whole document in Markdown>"}';
  async function askDoc(prompt) {
    const text = await ask(prompt + DOC_ANSWER, [], 8000);
    let doc = "";
    try { doc = readJson(text).doc || ""; } catch (e) { doc = text.trim().startsWith("{") ? "" : text; }
    doc = String(doc).trim();
    if (!doc) throw new Error("The AI's answer came back empty. Try again.");
    return doc;
  }
  /** A Google Doc made from Markdown (headings and bullets come out formatted), like save_doc on the computer. */
  async function saveDoc(parent, title, markdown) {
    for (const type of ["text/markdown", "text/plain"]) {
      try {
        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify({ name: title, parents: [parent], mimeType: DOC })], { type: "application/json" }));
        form.append("file", new Blob([markdown], { type }));
        return (await (await call("POST", UPLOAD + "?uploadType=multipart&fields=id", form)).json()).id;
      } catch (e) { if (e.message === "signin" || type === "text/plain") throw e; }
    }
  }
  /** A fresh Strategy for a client, saved next to their folders as "<client> - Strategy - <date>" (Create Posts reads the newest). */
  async function strategy(client, test, say) {
    say("Getting what we know about them...");
    const info = await businessInfo(client);
    say("Writing their strategy... (up to a minute)");
    const doc = await askDoc(PLAN_PROMPT.replace("{business_info}", info));
    let parent = await clientId(client);
    if (test) parent = await folder(parent, "Testing");
    const title = `${client} - Strategy - ${today()}`;
    const id = await saveDoc(parent, title, doc);
    refreshed();
    return { id, title, doc };
  }
  /** RAC Prospects sits next to RAC Clients, like on the computer. */
  async function prospectsFolder() {
    const root = await rootId();
    const meta = await (await call("GET", API + "/" + encodeURIComponent(root) + "?fields=parents")).json();
    return folder((meta.parents || [])[0] || "root", "RAC Prospects");
  }
  function prospectName(website, notes) {
    const site = String(website || "").trim();
    if (site) { try { return new URL(/^https?:/i.test(site) ? site : "https://" + site).hostname.replace(/^www\./, ""); } catch (e) {} }
    return safeName(String(notes || "").split("\n")[0].replace(/^\s*business\s*:\s*/i, "").split(",")[0].slice(0, 40)) || "New prospect";
  }
  /** Pitch a Business: their Strategy, then the Pitch Kit built on it, both in RAC Prospects / <name>. */
  async function pitch(website, notes, say) {
    const name = prospectName(website, notes);
    const info = [website ? "Website: " + website.trim() : "", notes ? "Notes from the agency:\n" + notes.trim() : ""].filter(Boolean).join("\n")
      + "\n(Their website wasn't read for this: only use what's written here.)";
    say("Opening RAC Prospects in Drive...");
    const dir = await folder(await prospectsFolder(), name);
    say("Step 1 of 2: writing their strategy... (up to a minute)");
    const plan = await askDoc(PLAN_PROMPT.replace("{business_info}", info));
    const planId = await saveDoc(dir, `${name} - Strategy - ${today()}`, plan);
    say("Step 2 of 2: writing the pitch: sample posts, email and talking points... (up to a minute)");
    const s = await settings();
    const kit = await askDoc(PITCH_PROMPT.replace("{num_posts}", String(s.num_posts || "5"))
      .replace("{signature}", String(s.signature || "").trim() || "[Your name and agency]")
      .replace("{business_info}", info + "\n\nSOCIAL MEDIA PLAN ALREADY DRAFTED FOR THIS CLIENT:\n" + plan));
    const pitchId = await saveDoc(dir, `${name} - Pitch - ${today()}`, kit);
    return { name, folder: dir, planId, pitchId, plan, kit };
  }
  /** Recent prospects (newest first), each with its Strategy and Pitch docs. */
  async function prospects() {
    const dir = await prospectsFolder();
    const url = API + "?q=" + encodeURIComponent(`'${dir}' in parents and mimeType = '${FOLDER}' and trashed = false`)
      + "&pageSize=200&fields=files(id,name,modifiedTime)";
    const found = ((await (await call("GET", url)).json()).files || []).sort((a, b) => (a.modifiedTime || "") < (b.modifiedTime || "") ? 1 : -1);
    return found.slice(0, 15);
  }

  // ---------- New Client: their folder, with the computer's usual folders inside ----------
  const CLIENT_FOLDERS = ["Client Info", "Brand", "Templates", "Inspiration", "Raw Photos", "Raw Video", "Finished Video", "Posts",
                          "Final Posts", "Plan Builder Proofs"];
  async function newClient(name, details, logo, say) {
    name = String(name || "").replace(/[\\/:*?"<>|#]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("Type the client's name first.");
    const root = await rootId();
    if (await findFolder(root, name)) throw new Error(`There's already a client folder named ${name}.`);
    say("Making their folder...");
    const id = await folder(root, name);
    for (const f of CLIENT_FOLDERS) await folder(id, f);
    const lines = [["Website", details.website], ["Contact line", details.contact], ["Notes", details.notes]]
      .filter(([, v]) => String(v || "").trim()).map(([k, v]) => `${k}: ${String(v).trim()}`);
    if (lines.length) { say("Saving their notes..."); await addNote(name, "New client. " + lines.join("\n")); }
    if (logo) {
      say("Saving their logo...");
      const ext = ((logo.name || "").split(".").pop() || "jpg").toLowerCase();
      await upload(await folder(id, "Brand"), `${name} logo.${ext}`, new Blob([await logo.arrayBuffer()], { type: logo.type || "image/jpeg" }), logo.type || "image/jpeg");
    }
    refreshed();
    return { id, name };
  }

  // ---------- changes the client asked for (Show to Client > Needs Changes), in the main folder ----------
  const FEEDBACK = "Plan Builder iPad Feedback.json";
  async function feedbackFile() {
    const root = await rootId();
    const url = API + "?q=" + encodeURIComponent(`'${root}' in parents and name = '${q(FEEDBACK)}' and trashed = false`) + "&fields=files(id)";
    return { root, file: ((await (await call("GET", url)).json()).files || [])[0] || null };
  }
  async function feedback() {
    const { file } = await feedbackFile();
    if (!file) return {};
    try { const v = JSON.parse((await (await call("GET", API + "/" + file.id + "?alt=media")).text()) || "{}"); return v && typeof v === "object" ? v : {}; }
    catch (e) { if (e.message === "signin") throw e; return {}; }
  }
  const changeKey = (client, post) => "changes:" + client + "|" + post;
  async function writeFeedback(change) {
    const { root, file } = await feedbackFile();
    let all = {};
    if (file) { try { all = JSON.parse((await (await call("GET", API + "/" + file.id + "?alt=media")).text()) || "{}"); } catch (e) {} }
    change(all);
    const text = JSON.stringify(all, null, 1);
    if (file) await replaceText(file.id, text, "application/json");
    else await upload(root, FEEDBACK, new Blob([text], { type: "application/json" }), "application/json");
    return all;
  }
  /** The client wants changes to a post: kept with the post, and added to their iPad Notes. */
  async function askChanges(client, post, name, note) {
    await writeFeedback(all => { all[changeKey(client, post)] = { day: today(), post: name, note: note.trim() }; });
    await addNote(client, `${client} asked for changes to "${name}": ${note.trim() || "(no details)"}`);
  }
  async function clearChanges(client, post) {
    await writeFeedback(all => { delete all[changeKey(client, post)]; });
  }

  return { SIZES, settings, engine, testMode, local, setLocal, plan, brand, render, drawSlide, save, saveCaption, rewriteCaption,
           addPhotos, captionText, fixHashtags, picture, photoUrl, logToDrive, Refused, palette, brandKit, safeName,
           deckToFinal, slideFiles, notes, addNote, docLink, feedback, askChanges, clearChanges, changeKey,
           strategy, pitch, prospects, newClient, saveDoc,
           drive: { API, UPLOAD, FOLDER, DOC, call, token, signedIn, children, findFolder, folder, upload, replaceText, trash, rootId,
                    clientId, refreshed, today, q } };   // for opus.js
})();
