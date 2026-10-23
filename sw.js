// Plan Builder for iPad and the web: the "api/..." addresses the page asks for are answered here,
// straight from Google Drive (no computer needed). Works the same way as Drive.java in the Android app.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER = "application/vnd.google-apps.folder";
const FINAL_FOLDER = "Final Posts", OLDER_FOLDER = "Older versions", PROOFS_FOLDER = "Plan Builder Proofs";
const PENDING = "Plan Builder Phone Approvals.json";   // the phone/iPad adds approvals here
const PUBLISHED = "Plan Builder Approved.json";        // the computer's approved list
const SETTINGS_FILE = "Plan Builder Settings.json";    // the computer's settings (Brand Kits...), Version 81 and newer
const TEST_FOLDER = "Testing";                         // Test mode: everything goes in <client> / Testing
// Never read as the client's photos: screenshots of other businesses, and the app's own output (like drive.py)
const NOT_PHOTOS = ["Inspiration", FINAL_FOLDER, "Final Exports for Posting", OLDER_FOLDER, PROOFS_FOLDER, "Posts",
                    "Carousels", "Archive", TEST_FOLDER];
const VERSION = 2;                                     // the page checks this, so a new page never talks to an old helper
const FIELDS = "id,name,mimeType,thumbnailLink,createdTime,modifiedTime";
const API = "https://www.googleapis.com/drive/v3/files";
const LIST_SECONDS = 120;                             // folder listings are remembered for 2 minutes
const STORE = "planbuilder-settings";                 // the page saves the sign-in and folder name here

class SignInNeeded extends Error {}
class Problem extends Error {}

// ---------- settings the page saved ----------
async function setting(name) {
  const cache = await caches.open(STORE);
  const r = await cache.match(new URL("__" + name, self.registration.scope).href);
  return r ? (await r.text()) : "";
}

class Drive {
  constructor(rootName) {
    this.rootName = rootName;
    this.rootId = null;
    this.clients = new Map();
    this.items = new Map();
    this.listCache = new Map();
  }

  async token() {
    const saved = await setting("token");
    if (!saved) throw new SignInNeeded("Please sign in to Google.");
    const [token, until] = saved.split(" ");
    if (Date.now() > Number(until || 0)) throw new SignInNeeded("Please sign in to Google again.");
    return token;
  }

  // ---------- talking to Drive ----------
  async call(method, url, body, bodyType, extraHeaders) {
    for (let attempt = 0; ; attempt++) {
      const headers = Object.assign({ Authorization: "Bearer " + (await this.token()) }, extraHeaders || {});
      if (body != null) headers["Content-Type"] = bodyType;
      let res;
      try { res = await fetch(url, { method, headers, body }); }
      catch (e) { throw new Problem("Couldn't reach Google Drive. Check the internet connection."); }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 << attempt));
        continue;
      }
      if (res.status >= 400) {
        let why = await res.text();
        try { why = JSON.parse(why).error.message; } catch (e) {}
        if (res.status === 401 || res.status === 403 && String(why).toLowerCase().includes("scope")) {
          throw new SignInNeeded("Please sign in to Google again.");
        }
        throw new Problem("Google Drive said: " + why);
      }
      return res;
    }
  }

  async json(url) { return (await this.call("GET", url)).json(); }

  /** Every file matching a Drive search, sorted by name. */
  async list(query, fields) {
    const found = [];
    let page = null;
    do {
      const url = API + "?q=" + encodeURIComponent(query) + "&pageSize=1000&orderBy=name&fields="
        + encodeURIComponent("nextPageToken,files(" + fields + ")") + (page ? "&pageToken=" + encodeURIComponent(page) : "");
      const result = await this.json(url);
      for (const item of result.files || []) { this.items.set(item.id, item); found.push(item); }
      page = result.nextPageToken || null;
    } while (page);
    return found;
  }

  /** {folder id: what's inside it} for many folders, asking Drive about up to 30 at once. */
  async childrenOf(folderIds, fresh) {
    const result = new Map(), missing = [], now = Date.now();
    for (const id of folderIds) {
      const remembered = fresh ? null : this.listCache.get(id);
      if (remembered && now - remembered[0] < LIST_SECONDS * 1000) result.set(id, remembered[1]);
      else if (!missing.includes(id)) missing.push(id);
    }
    for (let start = 0; start < missing.length; start += 30) {
      const batch = missing.slice(start, start + 30), found = new Map();
      batch.forEach(id => found.set(id, []));
      const either = batch.map(id => `'${id}' in parents`).join(" or ");
      for (const item of await this.list("(" + either + ") and trashed = false", FIELDS + ",parents")) {
        for (const p of item.parents || []) { const into = found.get(p); if (into) into.push(item); }
      }
      for (const [id, inside] of found) { this.listCache.set(id, [Date.now(), inside]); result.set(id, inside); }
    }
    return result;
  }

  async children(folderId, fresh) { return (await this.childrenOf([folderId], fresh)).get(folderId); }

  async root() {
    if (!this.rootId) {
      const found = await this.list(`name = '${quote(this.rootName)}' and mimeType = '${FOLDER}' and trashed = false`, FIELDS);
      if (!found.length) throw new Problem(`Couldn't find a folder named '${this.rootName}' in your Google Drive. `
        + "Tap 'Change the Drive folder' to type its exact name.");
      this.rootId = found[0].id;
    }
    return this.rootId;
  }

  // ---------- what the screens ask for ----------
  async clientList() {
    const folders = await this.list(`'${await this.root()}' in parents and mimeType = '${FOLDER}' and trashed = false`, FIELDS);
    const found = new Map(), names = [];
    for (const f of folders) {
      found.set(f.name, f.id);
      if (!f.name.startsWith("_") && !names.includes(f.name)) names.push(f.name);
    }
    this.clients = found;
    return names.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  }

  async clientId(client) {
    if (!this.clients.has(client)) await this.clientList();
    const id = this.clients.get(client);
    if (!id) throw new Problem("No client folder named " + client + ".");
    return id;
  }

  /** Where the app's work goes for a client: their folder, or its Testing folder in Test mode (null if none yet). */
  async home(client, test) {
    const id = await this.clientId(client);
    if (!test) return id;
    const folder = childFolder(await this.children(id, true), TEST_FOLDER);
    return folder ? folder.id : null;
  }

  /** The client's finished posts in Final Posts, grouped by post with each size (like phone.py). */
  async posts(client, test) {
    const home = await this.home(client, test);
    if (!home) return [];
    const fin = childFolder(await this.children(home, true), FINAL_FOLDER);
    if (!fin) return [];
    const marks = await this.approvals();
    const posts = new Map();
    for (const found of await this.finalSets(fin.id, "", 6)) {
      const key = found.post, path = found.path, name = found.name;
      const size = path.includes("9x16") || name.includes("9x16") ? "9:16" : "4:5";
      let entry = posts.get(key);
      if (!entry) {
        const mark = marks[approvalKey(client, key)];
        entry = { post: key, name: postTitle(name), sizes: {}, approved: mark === undefined ? null : mark, newest: "" };
        posts.set(key, entry);
      }
      const { images, caption, video } = found;
      if (!(size in entry.sizes)) {
        entry.sizes[size] = {
          images: images.map(i => i.id),
          folderId: found.id === (video && video.id) ? null : found.id,
          plan: found.plan ? found.plan.id : null,
          caption: caption ? caption.id : null,
          video: video ? video.id : null,
          video_type: video ? (video.mimeType || "video/mp4") : "video/mp4",
          folder: path.includes("Video Posts") ? "Video Posts" : "Photo Posts",
        };
      }
      let made = "";
      for (const image of images) { const c = image.createdTime || ""; if (c > made) made = c; }
      if (!made && video) made = video.createdTime || "";
      if (made > entry.newest) entry.newest = made;
    }
    const sorted = [...posts.values()].sort((a, b) => a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0);
    for (const post of sorted) {
      post.cover = null;
      for (const size of ["4:5", "9:16"]) {
        const set = post.sizes[size];
        if (set && set.images.length) { post.cover = set.images[0]; break; }
      }
    }
    return sorted;
  }

  /** The posts in Final Posts: one folder per post. Older versions put them a few folders down. */
  async finalSets(finalId, path, depth) {
    const sets = [], have = new Set();
    for (const found of await this.exportedSets(finalId, path)) {
      found.post = postName(found.name);
      sets.push(found);
      have.add(found.id);
    }
    if (depth > 0) {
      for (const item of await this.children(finalId, false)) {
        if (isFolder(item) && !have.has(item.id) && item.name !== OLDER_FOLDER) {
          sets.push(...await this.finalSets(item.id, path + item.name + "/", depth - 1));
        }
      }
    }
    return sets;
  }

  /** The JPG sets inside one folder: one per post folder, each with its Caption.txt and swipe video. */
  async exportedSets(exportId, path) {
    const sets = [], inside = await this.children(exportId, false);
    const folders = inside.filter(isFolder), videos = inside.filter(i => !isFolder(i) && (i.mimeType || "").startsWith("video/"));
    const listing = folders.length ? await this.childrenOf(folders.map(f => f.id), false) : new Map();
    for (const folder of folders) {
      const files = listing.get(folder.id) || [];
      const images = [], swipes = [];
      let caption = null, plan = null;
      for (const f of files) {
        const kind = f.mimeType || "";
        if (kind.startsWith("image/")) images.push(f);
        else if (kind.startsWith("video/")) swipes.push(f);
        if (!caption && f.name.toLowerCase().endsWith("caption.txt")) caption = f;
        if (!plan && f.name.toLowerCase().endsWith("slides.json")) plan = f;     // made on the iPad: can be remade
      }
      if (!images.length && !swipes.length) continue;
      images.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
      const start = folder.name.toLowerCase() + " - swipe video";
      for (const v of videos) if (v.name.toLowerCase().startsWith(start)) swipes.push(v);
      nineBySixteenFirst(swipes);
      sets.push({ id: folder.id, name: folder.name, path: path + folder.name, images, caption, plan, video: swipes[0] || null });
    }
    // Swipe videos made without JPGs ('Swipe video only') are posts of their own
    const have = new Set();
    for (const s of sets) { have.add(s.name.trim().toLowerCase()); have.add(postName(s.name)); }
    const sortedVideos = [...videos];
    nineBySixteenFirst(sortedVideos);
    for (const video of sortedVideos) {
      const name = video.name, stem = name.split(/ - swipe video/i)[0].trim();
      if (name.toLowerCase().includes(" - swipe video") && !have.has(stem.toLowerCase()) && !have.has(postName(stem))) {
        have.add(stem.toLowerCase());
        sets.push({ id: video.id, name: stem, path: path + name, images: [], caption: null, video });
      }
    }
    return sets;
  }

  /** Every photo in the client's folders (not Inspiration or the app's own work), like media_in on the computer. */
  async media(client) {
    const photos = [];
    let level = [{ id: await this.clientId(client), path: "" }];
    for (let depth = 0; depth < 5 && level.length; depth++) {
      const inside = await this.childrenOf(level.map(f => f.id), depth === 0);
      const next = [];
      for (const folder of level) {
        for (const item of inside.get(folder.id) || []) {
          const path = folder.path + item.name;
          if (isFolder(item)) {
            if (depth < 4 && !NOT_PHOTOS.includes(item.name)) next.push({ id: item.id, path: path + "/" });
          } else if ((item.mimeType || "").startsWith("image/")) {
            photos.push({ id: item.id, name: item.name, path, folder: folder.path.replace(/\/$/, "") || "(main folder)",
                          type: item.mimeType, made: item.createdTime || "" });
          }
        }
      }
      level = next;
    }
    return photos;
  }

  /** The newest Strategy doc in the client's folder, as text ("" when there isn't one). */
  async strategy(client) {
    const docs = (await this.children(await this.clientId(client), false)).filter(i => i.name.includes(" - Strategy - "));
    docs.sort((a, b) => (a.modifiedTime || "") < (b.modifiedTime || "") ? 1 : -1);
    for (const doc of docs) {
      try {
        const url = doc.mimeType === "application/vnd.google-apps.document"
          ? API + "/" + encodeURIComponent(doc.id) + "/export?mimeType=text/plain"
          : API + "/" + encodeURIComponent(doc.id) + "?alt=media";
        if (doc.mimeType && !doc.mimeType.startsWith("text/") && !doc.mimeType.includes("google-apps.document")) continue;
        const text = (await (await this.call("GET", url)).text()).trim();
        if (text) return text.slice(0, 6000);
      } catch (e) { if (e instanceof SignInNeeded) throw e; }
    }
    return "";
  }

  async proofs(client) {
    const folder = childFolder(await this.children(await this.clientId(client), true), PROOFS_FOLDER);
    if (!folder) return [];
    const pdfs = (await this.children(folder.id, true)).filter(i => i.mimeType === "application/pdf");
    pdfs.sort((a, b) => (a.modifiedTime || "") < (b.modifiedTime || "") ? 1 : (a.modifiedTime || "") > (b.modifiedTime || "") ? -1 : 0);
    return pdfs.slice(0, 40).map(p => ({ id: p.id, name: p.name }));
  }

  // ---------- files ----------
  async item(fileId) {
    if (!this.items.has(fileId)) {
      this.items.set(fileId, await this.json(API + "/" + encodeURIComponent(fileId) + "?fields=" + encodeURIComponent(FIELDS)));
    }
    return this.items.get(fileId);
  }

  /** A file, passed straight through (so videos can skip ahead). small = Google's 600-pixel picture of it. */
  async file(fileId, small, range, big) {
    const item = await this.item(fileId);
    if ((small || big) && item.thumbnailLink) {      // big: a 2000-pixel copy, plenty for 1080-wide slides
      try {
        const r = await this.call("GET", item.thumbnailLink.replace(/=s\d+$/, big ? "=s2000" : "=s600"));
        return new Response(r.body, { headers: { "Content-Type": r.headers.get("Content-Type") || "image/jpeg",
                                                  "Cache-Control": "private, max-age=3600" } });
      } catch (e) { if (e instanceof SignInNeeded) throw e; }   // no picture from Google: use the file itself
    }
    const r = await this.call("GET", API + "/" + encodeURIComponent(fileId) + "?alt=media", null, null,
                              range ? { Range: range } : null);
    const headers = new Headers({ "Content-Type": item.mimeType || r.headers.get("Content-Type") || "application/octet-stream",
                                  "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
    for (const h of ["Content-Length", "Content-Range"]) if (r.headers.get(h)) headers.set(h, r.headers.get(h));
    return new Response(r.body, { status: r.status, headers });
  }

  async text(fileId) {
    return (await this.call("GET", API + "/" + encodeURIComponent(fileId) + "?alt=media")).text();
  }

  // ---------- approvals, shared with the computer app ----------
  async findFile(name) {
    const found = await this.list(`'${await this.root()}' in parents and name = '${quote(name)}' and mimeType != '${FOLDER}' and trashed = false`, FIELDS);
    return found[0] || null;
  }

  async jsonFile(name) {
    const found = await this.findFile(name);
    if (!found) return {};
    const text = await this.text(found.id);
    try { const v = JSON.parse(text.trim() || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
  }

  /** Approved posts: the computer's list, plus approvals made here it hasn't picked up yet. */
  async approvals() {
    const marks = await this.jsonFile(PUBLISHED), pending = await this.jsonFile(PENDING);
    for (const key of Object.keys(pending)) if (!(key in marks)) marks[key] = pending[key];
    return marks;
  }

  /** Mark a post approved (both sizes). Returns the day, e.g. 2026-10-14. */
  async approve(client, post) {
    await this.clientId(client);
    const key = approvalKey(client, post), d = new Date();
    const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const pending = await this.jsonFile(PENDING);
    if (!(key in pending)) pending[key] = today;
    const text = JSON.stringify(pending, null, 1);
    const found = await this.findFile(PENDING);
    if (found) {
      await this.call("PATCH", "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(found.id)
        + "?uploadType=media", text, "application/json");
    } else {
      const boundary = "planbuilder" + Date.now();
      const meta = { name: PENDING, mimeType: "application/json", parents: [await this.root()] };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}`
        + `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
      await this.call("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", body,
                      "multipart/related; boundary=" + boundary);
    }
    return pending[key] || today;
  }
}

const quote = (name) => name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const isFolder = (item) => item.mimeType === FOLDER;
const childFolder = (inside, name) => inside.find(i => isFolder(i) && i.name === name) || null;
const nineBySixteenFirst = (videos) => videos.sort((a, b) => (a.name.includes("9x16") ? 0 : 1) - (b.name.includes("9x16") ? 0 : 1));

// ---------- post names (the same rules as drive.py on the computer) ----------
const DASH_TAIL = /\s*[-–]\s*(ig|fb|instagram|facebook)(\s*\/?\s*tiktok)?\s*(4\s*x\s*5|9\s*x\s*16|4:5|9:16)\s*$/i;
const BARE_TAIL = /\s+(4\s*x\s*5|9\s*x\s*16)\s*$/i;
const SIZE_TAIL = /\s*[(\[]\s*(instagram|facebook|fb|tiktok|ig|4\s*x\s*5|4:5|9\s*x\s*16|9:16)[^()\[\]]*(\([^()]*\))?[^()\[\]]*[)\]]\s*$/i;

/** 'Meet Amber (Instagram 4x5).pptx' -> 'Meet Amber'. */
function postTitle(name) {
  name = (name || "").trim();
  if (/\.(pptx|potx|ppt)$/i.test(name)) name = name.slice(0, name.lastIndexOf("."));
  for (let i = 0; i < 2; i++) {
    name = name.replace(SIZE_TAIL, "");
    name = name.replace(DASH_TAIL, "");
    name = name.replace(BARE_TAIL, "").trim();
  }
  return name || "Post";
}
const postName = (name) => postTitle(name).toLowerCase();
const approvalKey = (client, post) => "approved:" + client + "|" + postName(post);

// ---------- answering the page ----------
let drive = null;
async function getDrive() {
  const rootName = (await setting("root")) || "RAC Clients";
  if (!drive || drive.rootName !== rootName) drive = new Drive(rootName);
  return drive;
}
const reply = (data, status) => new Response(JSON.stringify(data), { status: status || 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function answer(request, what, q) {
  try {
    const d = await getDrive();
    if (what === "clients") return reply({ clients: await d.clientList() });
    if (what === "version") return reply({ version: VERSION });
    if (what === "posts") return reply({ posts: await d.posts(q.get("client"), q.get("test") === "1") });
    if (what === "media") return reply({ photos: await d.media(q.get("client")) });
    if (what === "strategy") return reply({ text: await d.strategy(q.get("client")) });
    if (what === "settings") return reply({ settings: await d.jsonFile(SETTINGS_FILE) });
    if (what === "proofs") return reply({ proofs: await d.proofs(q.get("client")) });
    if (what === "caption" || what === "text") return reply({ text: (await d.text(q.get("id"))).trim() });
    if (what === "approve") return reply({ approved: await d.approve(q.get("client"), q.get("post")) });
    if (what === "file") return await d.file(q.get("id"), q.get("small") === "1", request.headers.get("Range"), q.get("big") === "1");
    return reply({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof SignInNeeded) return reply({ error: e.message }, 401);
    return reply({ error: e.message || "Something went wrong." }, 500);
  }
}

if (typeof self !== "undefined") {
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => { if (event.data === "reset") drive = null; });
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url), base = new URL("api/", self.registration.scope);
  if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
    event.respondWith(answer(event.request, url.pathname.slice(base.pathname.length), url.searchParams));
  }
});
}

if (typeof module !== "undefined") module.exports = { Drive, postTitle, postName };   // for testing on a computer
