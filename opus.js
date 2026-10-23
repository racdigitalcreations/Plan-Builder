// Plan Builder for iPad: Add Videos and OpusClip (Send to Opus, Bring Clips Back), like Tools > Opus Clip on the computer.
// The iPad talks to Opus itself, with an Opus key kept on this iPad. Videos sent from the iPad are listed in
// "Plan Builder iPad Opus.json" in the main Drive folder; videos sent from the computer come from its shared settings.

const OPUS = (() => {
  const BASE = "https://api.opus.pro";
  const DASHBOARD = "https://clip.opus.pro/dashboard";
  const MIN_CREDITS = 10;                                 // every Opus project uses at least 10 credits (1 credit = 1 minute)
  const CLIP_LENGTHS = { "Auto": null, "Under 30s": [0, 30], "30-60s": [30, 60], "60-90s": [60, 90] };
  const LAYOUTS = { "Vertical 9:16": "portrait", "Square": "square", "Horizontal": "landscape" };
  const DONE = "COMPLETE", STUCK = "STALLED";
  const STAGE_WORDS = { PENDING: "waiting to start", QUEUED: "in line", IMPORT: "importing", CURATE: "finding the best moments",
                        REFINE: "refining clips", RENDER: "rendering clips", UPLOAD: "finishing up", [DONE]: "ready to review",
                        [STUCK]: "stuck, check it in Opus" };
  const LIST = "Plan Builder iPad Opus.json";
  const RAW = "Raw Video";
  const TOO_BIG = 2e9;                                   // bigger videos go from the computer (the iPad holds the whole file)
  const CHUNK = 32 * 256 * 1024;                          // 8 MB pieces: Google wants them in steps of 256 KB
  // Never offered as raw footage: the app's own output, and other businesses' videos (like the computer's Opus list)
  const SKIP = ["Opus Clips", "Ken Burns Videos", "Finished Video", "Posts", "Final Posts", "Final Exports for Posting", "Testing",
                "Archive", "Inspiration", "Older versions", "Plan Builder Proofs", "Carousels"];
  const D = MAKE.drive;
  const key = () => MAKE.local("opus_key");

  class Blocked extends Error {}
  const BLOCKED = "The iPad couldn't reach Opus. Either the Opus key isn't right, or Opus doesn't let web pages talk to it. " +
                  "Check the key under the gear (Check Opus). If the key is right, send videos from the computer instead.";

  const credits = (ms) => Math.max(MIN_CREDITS, ms ? Math.ceil(ms / 60000) : 0);
  const length = (ms) => ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "?:??";
  const mb = (bytes) => bytes ? (bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(bytes / 1e6)) + " MB") : "";
  const stem = (name) => String(name || "video").replace(/\.[^.]+$/, "");

  // ---------- talking to Opus ----------
  async function opus(method, path, body) {
    const k = key();
    if (!k) throw new Error("No Opus key on this iPad yet. Tap the gear on the Clients screen and paste it under Opus.");
    let res;
    try {
      const headers = { Authorization: "Bearer " + k, Accept: "application/json" };
      if (body) headers["Content-Type"] = "application/json";
      res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw navigator.onLine === false ? new Error("No internet connection.") : new Blocked(BLOCKED);
    }
    if (res.status === 401 || res.status === 403)
      throw new Error("Opus didn't accept the key. Copy it again from the Opus dashboard (lower-left corner), and check your plan includes API access.");
    if (res.status === 402) throw new Error("Opus says you're out of credits for this.");
    if (res.status === 429) throw new Error("Opus is busy (too many requests or projects at once). Wait a few minutes and try again.");
    const text = await res.text();
    if (res.status >= 400) throw new Error(`Opus said no (error ${res.status}): ${text.slice(0, 200)}`);
    try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
  }

  /** One request with progress (fetch can't report upload progress). Resolves with the XMLHttpRequest. */
  function xhr(method, url, headers, body, onProgress, responseType) {
    return new Promise((ok, bad) => {
      const r = new XMLHttpRequest();
      r.open(method, url);
      Object.entries(headers || {}).forEach(([k, v]) => r.setRequestHeader(k, v));
      if (responseType) r.responseType = responseType;
      const watch = body ? r.upload : r;
      if (onProgress) watch.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      r.onload = () => ok(r);
      r.onerror = () => bad(new Blocked("network"));
      r.ontimeout = () => bad(new Error("It took too long. Try again on Wi-Fi."));
      r.send(body == null ? null : body);
    });
  }
  const pct = (f) => Math.round(f * 100) + "%";

  // ---------- Google Drive: videos ----------
  async function list(parent) {
    const found = [];
    let page = "";
    do {
      const url = D.API + "?q=" + encodeURIComponent(`'${parent}' in parents and trashed = false`) + "&pageSize=1000&fields="
        + encodeURIComponent("nextPageToken,files(id,name,mimeType,size,createdTime,videoMediaMetadata)")
        + (page ? "&pageToken=" + encodeURIComponent(page) : "");
      const data = await (await D.call("GET", url)).json();
      found.push(...(data.files || []));
      page = data.nextPageToken || "";
    } while (page);
    return found;
  }
  /** The client's raw videos (Raw Video first, newest first), like Choose Videos on the computer. */
  async function videos(client) {
    const found = [];
    let level = [{ id: await D.clientId(client), path: "" }];
    for (let depth = 0; depth < 5 && level.length; depth++) {
      const next = [];
      for (const f of level) {
        for (const item of await list(f.id)) {
          if (item.mimeType === D.FOLDER) {
            if (depth < 4 && !SKIP.includes(item.name)) next.push({ id: item.id, path: f.path + item.name + "/" });
          } else if ((item.mimeType || "").startsWith("video/")) {
            found.push({ id: item.id, name: item.name, path: f.path + item.name, size: Number(item.size || 0),
                         ms: Number((item.videoMediaMetadata || {}).durationMillis || 0), made: item.createdTime || "" });
          }
        }
      }
      level = next;
    }
    return found.sort((a, b) => (b.path.startsWith(RAW + "/") - a.path.startsWith(RAW + "/")) || (a.made < b.made ? 1 : -1));
  }

  /** Big files go to Drive in one stream (a resumable upload), with progress. */
  async function driveUpload(parent, name, blob, type, onProgress) {
    const start = await D.call("POST", D.UPLOAD + "?uploadType=resumable&fields=id",
                               JSON.stringify({ name, parents: [parent], mimeType: type }), "application/json; charset=UTF-8");
    const where = start.headers.get("Location");
    if (!where) {                                         // no upload address to stream to: small files can go the plain way
      if (blob.size > 100e6) throw new Error("Google Drive didn't start the upload. Try again.");
      return D.upload(parent, name, blob, type);
    }
    // In 8 MB pieces, each read from the iPad's storage just before it goes: a long video never sits in memory all at once
    const total = blob.size;
    for (let at = 0; ; ) {
      const end = Math.min(at + CHUNK, total);
      const piece = new Blob([await blob.slice(at, end).arrayBuffer()]);
      const headers = { "Content-Range": total ? `bytes ${at}-${end - 1}/${total}` : "bytes */0" };
      let r;
      for (let attempt = 0; ; attempt++) {
        try { r = await xhr("PUT", where, headers, piece, (p) => onProgress && onProgress((at + p * (end - at)) / (total || 1))); }
        catch (e) { r = { status: 0 }; }
        if ((r.status === 0 || r.status >= 500) && attempt < 3) { await new Promise(ok => setTimeout(ok, 2000 << attempt)); continue; }
        break;
      }
      if (r.status === 308) { at = end; continue; }         // Google has this piece: send the next
      if (r.status === 0) throw new Error("The upload to Google Drive stopped. Check the internet connection and try again.");
      if (r.status >= 400) throw new Error(`The upload to Google Drive failed (error ${r.status}).`);
      try { return JSON.parse(r.responseText).id; } catch (e) { return ""; }
    }
  }

  /** How long a video from the iPad is (for the credits), read by the browser itself. */
  function duration(file) {
    return new Promise((done) => {
      const v = document.createElement("video"), url = URL.createObjectURL(file);
      const end = (ms) => { URL.revokeObjectURL(url); done(ms); };
      v.preload = "metadata"; v.muted = true;
      v.onloadedmetadata = () => end(isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
      v.onerror = () => end(0);
      setTimeout(() => end(0), 8000);
      v.src = url;
    });
  }

  /** New videos from the iPad go in <client> / Raw Video / <today> From iPad (where the computer's Opus list looks first). */
  async function addVideos(client, files, say) {
    const raw = await D.folder(await D.clientId(client), RAW);
    const day = await D.folder(raw, D.today() + " From iPad");
    const made = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i], label = `Video ${i + 1} of ${files.length}`;
      const name = f.name && !/^(video|image|IMG_\d+)?\.(mov|mp4|m4v)$/i.test(f.name) ? f.name
        : `iPad ${D.today()} ${String(Date.now()).slice(-6)}-${i + 1}.${(f.name || "").split(".").pop() || "mov"}`;
      say && say(`${label}: uploading to Drive (${mb(f.size)})...`);
      const type = f.type || "video/quicktime";
      const id = await driveUpload(day, name, f, type, (p) => say && say(`${label}: uploading to Drive... ${pct(p)}`));
      made.push({ id, name, path: `${RAW}/${D.today()} From iPad/${name}`, size: f.size, ms: await duration(f), local: f, type });
    }
    D.refreshed();
    return made;
  }

  // ---------- the list of videos sent to Opus ----------
  async function listFile() {
    const root = await D.rootId();
    const url = D.API + "?q=" + encodeURIComponent(`'${root}' in parents and name = '${D.q(LIST)}' and trashed = false`) + "&fields=files(id)";
    return { root, file: ((await (await D.call("GET", url)).json()).files || [])[0] || null };
  }
  async function readList(file) {
    if (!file) return { projects: [] };
    try {
      const v = JSON.parse((await (await D.call("GET", D.API + "/" + file.id + "?alt=media")).text()) || "{}");
      return v && Array.isArray(v.projects) ? v : { projects: [] };
    } catch (e) { if (e.message === "signin") throw e; return { projects: [] }; }
  }
  async function remember(project) {
    const { root, file } = await listFile(), all = await readList(file);
    all.projects = all.projects.filter(p => p.id !== project.id).concat([project]).slice(-200);
    const text = JSON.stringify(all, null, 1);
    if (file) await D.replaceText(file.id, text, "application/json");
    else await D.upload(root, LIST, new Blob([text], { type: "application/json" }), "application/json");
  }
  /** Every video sent to Opus (from the iPad or the computer), newest first. The iPad's own notes win. */
  async function projects(client) {
    const mine = (await readList((await listFile()).file)).projects;
    const pc = ((await MAKE.settings(true)).opus_projects || []).map(p => Object.assign({ from: "computer" }, p));
    const byId = new Map();
    pc.forEach(p => byId.set(p.id, p));
    mine.forEach(p => {
      const old = byId.get(p.id);
      if (!old) return byId.set(p.id, p);
      const finished = [p.stage, old.stage].find(s => s === DONE || s === STUCK);
      byId.set(p.id, Object.assign({}, old, p, { stage: finished || p.stage,
                                                 brought: [...new Set([...(old.brought || []), ...(p.brought || [])])] }));
    });
    return [...byId.values()].filter(p => !client || p.client === client)
      .sort((a, b) => (a.sent || "") < (b.sent || "") ? 1 : (a.sent || "") > (b.sent || "") ? -1 : 0);
  }

  // ---------- Send to Opus ----------
  async function send(client, item, options, say) {
    // A video from Drive has to be held whole on the iPad on its way to Opus, so those stop at 1 GB
    if (item.size > (item.local ? TOO_BIG : TOO_BIG / 2)) throw new Error(`${item.name} is ${mb(item.size)}, too big to send from the iPad. Send it from the computer.`);
    let blob = item.local;
    if (!blob) {
      say(`downloading from Drive (${mb(item.size)})...`);
      const r = await xhr("GET", D.API + "/" + encodeURIComponent(item.id) + "?alt=media",
                          { Authorization: "Bearer " + await D.token() }, null, (p) => say(`downloading from Drive... ${pct(p)}`), "blob");
      if (r.status >= 400) throw new Error(`Couldn't download it from Google Drive (error ${r.status}).`);
      blob = r.response;
    }
    say("starting the upload to Opus...");
    const link = await opus("POST", "/api/upload-links", { video: { usecase: "LocalUpload" } });
    if (!link.url || !link.uploadId) throw new Error("Opus didn't return an upload link.");
    let start;
    try { start = await fetch(link.url, { method: "POST", headers: { "x-goog-resumable": "start" } }); }
    catch (e) { throw new Blocked("Opus's upload server doesn't let the iPad send videos. Send this one from the computer."); }
    const where = start.headers.get("Location");
    if (start.status >= 400 || !where) throw new Blocked("Opus's upload server didn't give the iPad an upload address. Send this one from the computer.");
    const put = await xhr("PUT", where, { "Content-Type": "application/octet-stream" }, blob, (p) => say(`uploading to Opus... ${pct(p)}`));
    if (put.status >= 400) throw new Error(`The upload to Opus failed (error ${put.status}).`);
    say("starting the Opus project...");
    const body = { videoUrl: link.uploadId, importPref: { sourceLang: "auto" },
                   renderPref: { layoutAspectRatio: LAYOUTS[options.layout] || "portrait" } };
    if (CLIP_LENGTHS[options.length]) body.curationPref = { clipDurations: [CLIP_LENGTHS[options.length]] };
    body.uploadedVideoAttr = { title: stem(item.name).slice(0, 100) };
    const project = await opus("POST", "/api/clip-projects", body);
    const id = project.id || project.projectId;
    if (!id) throw new Error("Opus didn't return a project id.");
    const entry = { id, client, video: item.name, video_id: item.id, sent: D.today(), stage: "QUEUED", test: MAKE.testMode(), from: "iPad" };
    await remember(entry);
    return entry;
  }

  /** Ask Opus how far along each waiting video is (nothing is downloaded). */
  async function check(list) {
    const problems = [];
    for (const p of list.filter(p => p.stage !== DONE && p.stage !== STUCK)) {
      try {
        const got = await opus("GET", "/api/clip-projects/" + encodeURIComponent(p.id));
        if ((got.stage || "PENDING") !== p.stage) { p.stage = got.stage || "PENDING"; await remember(p); }
      } catch (e) { if (e instanceof Blocked) throw e; problems.push(`${p.video}: ${e.message}`); }
    }
    return problems;
  }

  async function clips(project) {
    const found = [];
    for (let page = 1; ; page++) {
      const r = await opus("GET", "/api/exportable-clips?q=findByProjectId&projectId=" + encodeURIComponent(project.id) + `&pageNum=${page}&pageSize=50`);
      const batch = Array.isArray(r) ? r : r.data || r.clips || [];
      found.push(...batch);
      if (batch.length < 50) return found;
    }
  }

  function clipNotes(video, keep) {
    const lines = [`Opus clips from ${video}`, ""];
    for (const [n, c] of keep) {
      lines.push(`${String(n).padStart(2, "0")}. ${c.title || "Untitled clip"} (${Math.round((c.durationMs || 0) / 1000)}s)`);
      if (c.description) lines.push(c.description);
      const tags = c.hashtags;
      if (tags) lines.push(Array.isArray(tags) ? tags.join(" ") : String(tags));
      lines.push("");
    }
    return lines.join("\n");
  }

  /** Save the ticked clips to <client> [/ Testing] / Posts / Video Posts / <sent> - Opus - <video> / Facebook TikTok 9x16. */
  async function bringHome(project, found, picked, say) {
    let base = await D.clientId(project.client);
    if (project.test) base = await D.folder(base, "Testing");
    const name = stem(project.video);
    const run = await D.folder(await D.folder(await D.folder(base, "Posts"), "Video Posts"), `${project.sent} - Opus - ${name}`);
    const target = await D.folder(run, "Facebook TikTok 9x16");
    const existing = new Map((await D.children(target)).map(f => [f.name, f.id]));
    const brought = new Set(project.brought || []), problems = [];
    let saved = 0, blocked = false;
    for (let i = 0; i < picked.length; i++) {
      const [row, clip] = picked[i];
      const title = String(clip.title || "clip").replace(/[\\/:*?"<>|]+/g, "").slice(0, 60).trim() || "clip";
      const file = `${String(row + 1).padStart(2, "0")} - ${title} - FB 9x16.mp4`, label = `Clip ${i + 1} of ${picked.length}`;
      try {
        const url = clip.uriForExport || clip.uriForPreview;
        if (!url) throw new Error("Opus has no download for it yet");
        say(`${label}: getting it from Opus...`);
        let r;
        try { r = await xhr("GET", url, null, null, (p) => say(`${label}: getting it from Opus... ${pct(p)}`), "blob"); }
        catch (e) { blocked = true; throw new Error("Opus doesn't let the iPad download it"); }
        if (r.status >= 400) throw new Error(`couldn't download it (error ${r.status})`);
        if (existing.has(file)) await D.trash(existing.get(file));      // bringing it home again: replace the old copy
        await driveUpload(target, file, r.response, "video/mp4", (p) => say(`${label}: saving to Drive... ${pct(p)}`));
        brought.add(clip.id || String(row));
        saved++;
      } catch (e) { if (e.message === "signin") throw e; problems.push(`${title}: ${e.message}`); }
    }
    if (saved) {
      const keep = found.map((c, i) => [i + 1, c]).filter(([n, c]) => brought.has(c.id || String(n - 1)));
      const doc = `${name} - Opus clip titles and hashtags`;
      if (existing.has(doc)) await D.trash(existing.get(doc));
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name: doc, parents: [target], mimeType: D.DOC })], { type: "application/json" }));
      form.append("file", new Blob([clipNotes(project.video, keep)], { type: "text/plain" }));
      await D.call("POST", D.UPLOAD + "?uploadType=multipart&fields=id", form);
      project.brought = [...brought].sort();
      project.clip_count = found.length;
      await remember(project);
      D.refreshed();
    }
    return { saved, problems, blocked, folder: target };
  }

  /** Settings > Check Opus: the key, the Opus address and the upload server, without using any credits. */
  async function checkConnection() {
    const link = await opus("POST", "/api/upload-links", { video: { usecase: "LocalUpload" } });
    if (!link.url) return { ok: false, text: "Opus answered, but didn't give an upload link. Try again later." };
    try {
      const start = await fetch(link.url, { method: "POST", headers: { "x-goog-resumable": "start" } });
      if (start.status >= 400 || !start.headers.get("Location")) throw new Error("no address");
    } catch (e) {
      return { ok: false, text: "The key works and Opus answers, but Opus's upload server won't take videos from the iPad. " +
                                "You can still check progress and bring clips back here; send the videos from the computer." };
    }
    return { ok: true, text: "Opus works from the iPad: the key is right, and videos can be sent. (No credits were used.)" };
  }

  return { DASHBOARD, MIN_CREDITS, CLIP_LENGTHS, LAYOUTS, DONE, STUCK, STAGE_WORDS, Blocked, credits, length, mb, stem,
           videos, addVideos, projects, send, check, clips, bringHome, checkConnection, remember, key };
})();

// ---------- the screens ----------
let opusReady = [];                                    // videos chosen to send: { client, id, name, path, size, ms, local? }

function pickVideos(then) {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "video/*"; input.multiple = true; input.style.display = "none";
  input.onchange = () => { const files = [...input.files]; input.remove(); if (files.length) then(files); };
  document.body.append(input); input.click();
}
/** Client screen > Add Videos, and Opus Clips > Add from iPad. */
function addVideos(client, after) {
  pickVideos(async (files) => {
    const { box, say } = busyBox("Uploading...");
    box.className = "busy overlay"; document.body.append(box);
    try {
      const made = await OPUS.addVideos(client, files, say);
      toast(`${made.length} video${made.length === 1 ? "" : "s"} added to Raw Video`);
      after && after(made);
    } catch (e) { fail(e, "Add Videos"); }
    box.remove();
  });
}

async function showOpus(client) {
  header("Opus Clips", client + " · OpusClip", () => showPosts(client));
  testBar();
  const length = MAKE.local("opus_length") || "Auto", layout = MAKE.local("opus_layout") || "Vertical 9:16";
  main.append($(`<div>
    ${OPUS.key() ? "" : `<p class="msg bad">No Opus key on this iPad yet. Go back to Clients, tap the gear, and paste it under Opus.</p>`}
    <div class="actions"><button class="btn ghost" id="ochoose">${ICON2.folder}Choose Videos</button>
      <button class="btn ghost" id="oadd">${ICON2.video}Add from iPad</button>
      <a class="btn ghost" href="${OPUS.DASHBOARD}" target="_blank" rel="noopener">${ICON2.present}Review in Opus</a></div>
    <h2>Ready to send</h2><div id="oready"></div>
    <div class="opts"><div><b>Clip length</b><div id="olen"></div></div><div><b>Layout</b><div id="olay"></div></div></div>
    <div class="row2"><button class="btn" id="osend">${ICON2.share}Send to Opus</button></div>
    <h2>Sent to Opus</h2><div class="row2"><button class="btn ghost" id="ocheck">Check Progress</button></div>
    <div id="osent"><div class="skel" style="height:62px"></div></div>
    <p class="muted">Opus usually takes 10 to 30 minutes per video. When one says <b>Ready to review</b>, tap Review in Opus and edit the clips
    there, then tap <b>Bring Clips Back</b>. They go to ${esc(client)}'s Posts &gt; Video Posts${MAKE.testMode() ? " (in Testing)" : ""}.
    Big videos: use Wi-Fi, and keep this screen open while they upload.</p></div>`));
  document.getElementById("olen").append(seg(Object.fromEntries(Object.keys(OPUS.CLIP_LENGTHS).map(k => [k, k])), length, (k) => MAKE.setLocal("opus_length", k)));
  document.getElementById("olay").append(seg(Object.fromEntries(Object.keys(OPUS.LAYOUTS).map(k => [k, k])), layout, (k) => MAKE.setLocal("opus_layout", k)));
  document.getElementById("ochoose").onclick = () => chooseOpusVideos(client);
  document.getElementById("oadd").onclick = () => addVideos(client, (made) => { made.forEach(m => opusReady.push(Object.assign({ client }, m))); drawOpusReady(client); });
  document.getElementById("osend").onclick = () => sendToOpus(client);
  document.getElementById("ocheck").onclick = () => drawOpusSent(client, true, false);
  drawOpusReady(client);
  drawOpusSent(client, true, true);
}

function drawOpusReady(client) {
  const box = document.getElementById("oready");
  if (!box) return;
  const mine = opusReady.filter(i => i.client === client);
  box.innerHTML = mine.length ? "" : `<p class="muted">Tap Choose Videos (from their Drive folder) or Add from iPad.</p>`;
  mine.forEach(item => {
    const row = $(`<div class="deck"><div class="ic">MP4</div><div class="nm"><div></div><div></div></div><button class="mini bad">Remove</button></div>`);
    row.querySelector(".nm div").textContent = item.name;
    row.querySelector(".nm div + div").textContent = [OPUS.length(item.ms), OPUS.mb(item.size), `about ${OPUS.credits(item.ms)} credits`,
                                                      item.local ? "from this iPad" : ""].filter(Boolean).join(" · ");
    row.querySelector("button").onclick = () => { opusReady = opusReady.filter(i => i !== item); drawOpusReady(client); };
    box.append(row);
  });
}

async function chooseOpusVideos(client) {
  const sheet = $(`<div class="sheet"><div class="sheet-in"><div class="sheet-head"><b>Videos in ${esc(client)}</b><button class="mini" data-close>Cancel</button></div>
    <div id="olist"><div class="skel" style="height:56px"></div></div>
    <div class="row2"><button class="btn" data-add>Add Selected</button></div></div></div>`);
  document.body.append(sheet);
  sheet.querySelector("[data-close]").onclick = () => sheet.remove();
  const list = sheet.querySelector("#olist");
  try {
    const found = await OPUS.videos(client);
    list.innerHTML = found.length ? `<p class="muted">Each video uses at least ${OPUS.MIN_CREDITS} Opus credits (1 credit = 1 minute).</p>`
      : `<p class="muted">No videos in ${esc(client)}'s Drive folder yet. Add from iPad puts new ones in Raw Video.</p>`;
    found.forEach(v => {
      const row = $(`<label class="check-row"><input type="checkbox"><span><span class="nm"></span><span class="muted"></span></span></label>`);
      row.querySelector(".nm").textContent = v.path;
      row.querySelector(".muted").textContent = ` ${OPUS.length(v.ms)} · ${OPUS.mb(v.size)} · about ${OPUS.credits(v.ms)} credits`;
      row.querySelector("input").checked = opusReady.some(i => i.id === v.id);
      row.video = v;
      list.append(row);
    });
    sheet.querySelector("[data-add]").onclick = () => {
      list.querySelectorAll(".check-row").forEach(row => {
        if (row.querySelector("input").checked && !opusReady.some(i => i.id === row.video.id)) opusReady.push(Object.assign({ client }, row.video));
      });
      sheet.remove(); drawOpusReady(client);
    };
  } catch (e) { sheet.remove(); fail(e, "Opus videos"); }
}

async function sendToOpus(client) {
  const items = opusReady.filter(i => i.client === client);
  if (!items.length) return toast("Choose some videos first.", true);
  if (!OPUS.key()) return toast("Put your Opus key in Settings first (the gear on the Clients screen).", true);
  const total = items.reduce((a, i) => a + OPUS.credits(i.ms), 0);
  if (!confirm(`Send ${items.length} video${items.length === 1 ? "" : "s"} to Opus?\n\nThis uses about ${total} of your Opus credits.`)) return;
  const { box, say } = busyBox("Starting...");
  box.className = "busy overlay"; document.body.append(box);
  const options = { length: MAKE.local("opus_length") || "Auto", layout: MAKE.local("opus_layout") || "Vertical 9:16" };
  let sent = 0;
  const problems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i], label = `Video ${i + 1} of ${items.length} (${item.name})`;
    try {
      await OPUS.send(client, item, options, (t) => say(`${label}: ${t}`));
      opusReady = opusReady.filter(x => x !== item);
      sent++;
    } catch (e) {
      if (e.message === "signin") break;
      problems.push(`${item.name}: ${e.message}`);
      if (e instanceof OPUS.Blocked) break;                // the same thing would stop every other video too
    }
  }
  box.remove();
  if (problems.length) fail(new Error((sent ? `Sent ${sent}. ` : "") + "Problems: " + problems.join("; ")), "Send to Opus");
  else toast(`Sent ${sent} video${sent === 1 ? "" : "s"} to Opus`);
  drawOpusReady(client);
  drawOpusSent(client, false, true);
}

async function drawOpusSent(client, ask, quiet) {
  const box = document.getElementById("osent");
  if (!box) return;
  try {
    const all = await OPUS.projects(client);
    if (ask && OPUS.key() && all.some(p => p.stage !== OPUS.DONE && p.stage !== OPUS.STUCK)) {
      try {
        const problems = await OPUS.check(all);
        if (problems.length && !quiet) toast("Problems: " + problems.join("; "), true);
      } catch (e) { if (!quiet) fail(e, "Opus progress"); }
    } else if (ask && !quiet) toast(OPUS.key() ? "Nothing is still being clipped." : "Put your Opus key in Settings first.", !OPUS.key());
    if (!document.getElementById("osent")) return;
    box.innerHTML = all.length ? "" : `<p class="muted">Nothing sent to Opus for ${esc(client)} yet.</p>`;
    all.slice(0, 30).forEach(p => {
      const brought = (p.brought || []).length;
      const state = p.stage === OPUS.DONE ? (brought ? `✓ ${brought} clip${brought === 1 ? "" : "s"} in Drive` + (p.clip_count ? ` (of ${p.clip_count})` : "") : "Ready to review")
        : OPUS.STAGE_WORDS[p.stage] || "processing";
      const row = $(`<div class="deck"><div class="ic">OPUS</div><div class="nm"><div></div><div></div></div></div>`);
      row.querySelector(".nm div").textContent = p.video;
      row.querySelector(".nm div + div").textContent = `Sent ${p.sent} from the ${p.from === "computer" ? "computer" : "iPad"}${p.test ? " (Test mode)" : ""} · ${state}`;
      if (p.stage === OPUS.DONE) {
        const b = $(`<button class="mini">${ICON2.save}Bring Clips Back</button>`);
        b.onclick = () => bringClipsBack(p);
        row.append(b);
      }
      box.append(row);
    });
  } catch (e) { if (document.getElementById("osent")) box.innerHTML = ""; fail(e, "Opus list"); }
}

async function bringClipsBack(project) {
  const sheet = $(`<div class="sheet"><div class="sheet-in"><div class="sheet-head"><b></b><button class="mini" data-close>Cancel</button></div>
    <p class="muted">Tick the clips you approved. Edit them in Opus first: the latest saved version comes back (give Opus a minute after your last change).</p>
    <div id="clist"><div class="skel" style="height:56px"></div></div>
    <div class="row2"><button class="btn ghost" data-all>All</button><button class="btn ghost" data-none>None</button></div>
    <div class="row2"><button class="btn green" data-save>${ICON2.save}Save Ticked Clips to Drive</button></div></div></div>`);
  sheet.querySelector(".sheet-head b").textContent = `Clips from ${project.video}`;
  document.body.append(sheet);
  sheet.querySelector("[data-close]").onclick = () => sheet.remove();
  const list = sheet.querySelector("#clist");
  let found;
  try { found = await OPUS.clips(project); }
  catch (e) { sheet.remove(); return fail(e, "Opus clips"); }
  if (!found.length) { sheet.remove(); return toast(`Opus has no clips for ${project.video}.`, true); }
  const brought = new Set(project.brought || []);
  list.innerHTML = "";
  found.forEach((clip, row) => {
    const line = $(`<label class="check-row"><input type="checkbox"><span><span class="nm"></span><span class="muted"></span></span></label>`);
    line.querySelector(".nm").textContent = `${String(row + 1).padStart(2, "0")}. ${clip.title || "Untitled clip"}`;
    line.querySelector(".muted").textContent = ` ${Math.round((clip.durationMs || 0) / 1000)}s` + (brought.has(clip.id || String(row)) ? " · ✓ already in Drive" : "");
    const watch = clip.uriForPreview || clip.uriForExport;
    if (watch) {
      const a = $(`<a class="mini" target="_blank" rel="noopener">Watch</a>`);
      a.href = watch; a.onclick = (e) => e.stopPropagation();
      line.append(a);
    }
    line.pick = [row, clip];
    list.append(line);
  });
  const boxes = () => [...list.querySelectorAll(".check-row")];
  sheet.querySelector("[data-all]").onclick = () => boxes().forEach(l => l.querySelector("input").checked = true);
  sheet.querySelector("[data-none]").onclick = () => boxes().forEach(l => l.querySelector("input").checked = false);
  sheet.querySelector("[data-save]").onclick = async () => {
    const picked = boxes().filter(l => l.querySelector("input").checked).map(l => l.pick);
    if (!picked.length) return toast("Tick a clip first.", true);
    sheet.remove();
    const { box, say } = busyBox("Starting...");
    box.className = "busy overlay"; document.body.append(box);
    try {
      const r = await OPUS.bringHome(project, found, picked, say);
      box.remove();
      if (r.problems.length) {
        fail(new Error(`Saved ${r.saved}. Couldn't save: ${r.problems.join("; ")}` +
                       (r.blocked ? ". Opus won't let the iPad download clips: bring them home on the computer, or tap Watch and save them from there." : "")), "Bring Clips Back");
      } else toast(`Saved ${r.saved} clip${r.saved === 1 ? "" : "s"} to Video Posts`);
      if (r.saved) {
        const done = $(`<div class="sheet"><div class="sheet-in"><div class="sheet-head"><b>Clips saved</b><button class="mini" data-close>Close</button></div>
          <p class="msg">${r.saved} clip${r.saved === 1 ? "" : "s"} and a doc of their titles and hashtags are in ${esc(project.client)}'s Posts &gt; Video Posts${project.test ? " (in Testing)" : ""}.</p>
          <div class="row2"><a class="btn" target="_blank" rel="noopener">${ICON2.folder}Open Clips Folder</a></div></div></div>`);
        done.querySelector("a").href = driveFolder(r.folder);
        done.querySelector("[data-close]").onclick = () => done.remove();
        document.body.append(done);
      }
    } catch (e) { box.remove(); fail(e, "Bring Clips Back"); }
    drawOpusSent(project.client, false, true);
  };
}
