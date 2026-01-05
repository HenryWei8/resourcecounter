(() => {
  if (window.__colonistTurnLoggerLoaded) return;
  window.__colonistTurnLoggerLoaded = true;

  const DEBUG = true;
  const LOG_ROOT_SELECTOR = "[class*='gameFeedsContainer']";
  const TICK_MS = 900;
  const TURN_IDLE_FLUSH_MS = 25000;

  const OVERLAY_ENABLED = true;
  const OVERLAY_MAX_ROWS = 40;
  const OVERLAY_WIDTH_PX = 360;

  const RES_KEYS = ["lumber", "brick", "wool", "grain", "ore"];
  const RES_WORD_TO_KEY = {
    lumber: "lumber",
    wood: "lumber",
    brick: "brick",
    clay: "brick",
    wool: "wool",
    sheep: "wool",
    grain: "grain",
    wheat: "grain",
    ore: "ore",
    rock: "ore",
    stone: "ore",
  };

  const BUILD_COST = {
    road: { lumber: 1, brick: 1 },
    settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 },
    dev: { wool: 1, grain: 1, ore: 1 },
  };

  function log(...args) {
    if (DEBUG) console.log("[CTL]", ...args);
  }
  function warn(...args) {
    console.warn("[CTL]", ...args);
  }

  function emptyBag() {
    const b = {};
    RES_KEYS.forEach((r) => (b[r] = 0));
    return b;
  }
  function addBag(dst, src, s = 1) {
    RES_KEYS.forEach((r) => (dst[r] += s * (src[r] || 0)));
  }
  function bagHasAny(b) {
    return RES_KEYS.some((r) => (b[r] || 0) !== 0);
  }

  let selfName = null;
  function detectSelfName() {
    if (selfName) return selfName;
    const cur = document.querySelector("[class*='currentUser']");
    if (cur) {
      const ne = cur.querySelector("[class*='username'],[class*='name']");
      if (ne) {
        selfName = ne.textContent.trim();
        return selfName;
      }
    }
    const info = document.querySelector(
      "[class*='gamePlayerInformationContainer']"
    );
    if (info) {
      const rows = info.querySelectorAll("[class*='playerRow']");
      if (rows.length) {
        const last = rows[rows.length - 1];
        const ne = last.querySelector("[class*='username'],[class*='name']");
        if (ne) {
          selfName = ne.textContent.trim();
          return selfName;
        }
      }
    }
    return selfName;
  }

  function normalizeActor(name) {
    if (!name) return null;
    if (name === "You" || name === "you") return detectSelfName() || name;
    return name;
  }

  function keyFromImg(img) {
    if (!img) return null;
    const alt = (img.alt || "").toLowerCase().trim();
    if (RES_WORD_TO_KEY[alt]) return RES_WORD_TO_KEY[alt];
    const src = (img.src || "").toLowerCase();
    for (const word of Object.keys(RES_WORD_TO_KEY)) {
      if (src.includes(word)) return RES_WORD_TO_KEY[word];
    }
    return null;
  }

  function dieFromImg(img) {
    if (!img) return null;
    const alt = (img.alt || "").toLowerCase().trim();
    let m = alt.match(/^dice_(\d+)$/);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v)) return v;
    }
    const src = (img.src || "").toLowerCase();
    m = src.match(/dice[_-](\d+)/);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v)) return v;
    }
    return null;
  }

  function readDiceFromNode(node) {
    if (!node) return null;
    const dice = [];
    const imgs = [...node.querySelectorAll("img[alt], img[src]")];
    for (const im of imgs) {
      const v = dieFromImg(im);
      if (v != null) dice.push(v);
    }
    return dice.length ? dice : null;
  }

  function devCardNameFromText(s) {
    const t = (s || "").toLowerCase();
    if (t.includes("knight")) return "Knight";
    if (t.includes("monopoly")) return "Monopoly";
    if (
      t.includes("year of plenty") ||
      (t.includes("year") && t.includes("plenty"))
    )
      return "Year of Plenty";
    if (t.includes("road") && t.includes("build")) return "Road Building";
    if (
      t.includes("1 point") ||
      t.includes("victory point") ||
      t.includes("victory")
    )
      return "Victory Point";
    return null;
  }

  function detectUsedDevCard(msgEl) {
    if (!msgEl) return null;
    const imgs = [...msgEl.querySelectorAll("img[alt], img[src]")];
    for (const im of imgs) {
      const n1 = devCardNameFromText(im.alt || "");
      if (n1) return n1;
      const n2 = devCardNameFromText(im.src || "");
      if (n2) return n2;
    }
    return null;
  }

  function detectDevPurchaseLabel(msgEl) {
    if (!msgEl) return null;
    const imgs = [...msgEl.querySelectorAll("img[alt], img[src]")];
    for (const im of imgs) {
      const alt = (im.alt || "").trim();
      const altL = alt.toLowerCase();
      const srcL = (im.src || "").toLowerCase();
      if (altL === "development card") return alt || "Development Card";
      if (altL.includes("development") && altL.includes("card"))
        return alt || "Development Card";
      if (srcL.includes("development") && srcL.includes("card"))
        return "Development Card";
    }
    return null;
  }

  function bagFromAllImages(node) {
    const bag = emptyBag();
    const imgs = node ? [...node.querySelectorAll("img")] : [];
    for (const im of imgs) {
      const k = keyFromImg(im);
      if (k) bag[k] += 1;
    }
    return bag;
  }

  function splitImagesGiveGetFallback_(node, giveText, midText, endText) {
    const give = emptyBag();
    const get = emptyBag();
    let mode = "before";
    const w = document.createTreeWalker(
      node,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 3) {
        const t = (n.textContent || "").toLowerCase();
        if (t.includes(String(giveText).toLowerCase())) mode = "give";
        if (t.includes(String(midText).toLowerCase())) mode = "get";
        if (endText && t.includes(String(endText).toLowerCase()))
          mode = "after";
      } else if (n.nodeType === 1 && n.tagName === "IMG") {
        const k = keyFromImg(n);
        if (!k) continue;
        if (mode === "give") give[k] += 1;
        else if (mode === "get") get[k] += 1;
      }
    }
    return { giveBag: give, getBag: get };
  }

  function splitImagesGiveGetByTextPositions(node, giveText, midText, endText) {
    const give = emptyBag();
    const get = emptyBag();
    const giveKey = String(giveText || "").toLowerCase();
    const midKey = String(midText || "").toLowerCase();
    const endKey = endText ? String(endText).toLowerCase() : null;
    const w = document.createTreeWalker(
      node,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    let full = "";
    let cursor = 0;
    const imgs = [];
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 3) {
        const t = (n.textContent || "").replace(/\s+/g, " ");
        full += t;
        cursor += t.length;
      } else if (n.nodeType === 1 && n.tagName === "IMG") {
        const k = keyFromImg(n);
        if (k) imgs.push({ pos: cursor, key: k });
      }
    }
    const lower = full.toLowerCase();
    const iGive = lower.indexOf(giveKey);
    const iMid = lower.indexOf(midKey, Math.max(0, iGive));
    const iEnd = endKey ? lower.indexOf(endKey, Math.max(0, iMid)) : -1;
    if (iGive < 0 || iMid < 0)
      return splitImagesGiveGetFallback_(node, giveText, midText, endText);
    const giveStart = iGive;
    const giveEnd = iMid;
    const getStart = iMid;
    const getEnd = iEnd >= 0 ? iEnd : Infinity;
    for (const im of imgs) {
      const p = im.pos;
      if (p >= giveStart && p < giveEnd) give[im.key] += 1;
      else if (p >= getStart && p < getEnd) get[im.key] += 1;
    }
    return { giveBag: give, getBag: get };
  }

  function extractNamesFromMessage(msgEl) {
    const nameSpans = [
      ...msgEl.querySelectorAll('span[style*="font-weight:600"]'),
    ];
    const names = nameSpans
      .map((s) => (s.textContent || "").trim())
      .filter(Boolean);
    let actor = names[0] || null;
    let partner = names.length >= 2 ? names[names.length - 1] : null;
    if (!actor) {
      const raw = (msgEl.innerText || msgEl.textContent || "")
        .trim()
        .replace(/\s+/g, " ");
      const m = raw.match(/^(\S+)/);
      actor = m ? m[1] : null;
      const pm = raw.match(/ from (\S+)/i);
      partner = pm ? pm[1].replace(/[.!?]$/, "") : null;
    }
    return { actor, partner };
  }

  function getVpForPlayerName(name) {
    if (!name) return "";
    const rows = document.querySelectorAll('div[class*="playerRow"]');
    for (const row of rows) {
      const nameEl =
        row.querySelector('div[class*="username"]') ||
        row.querySelector('div[class*="usernameLarge"]');
      if (!nameEl) continue;
      const rowName = (nameEl.textContent || "").trim();
      if (rowName !== name) continue;
      const vpEl = row.querySelector('span[class*="victoryPoints"]');
      if (!vpEl) return "";
      const vp = parseInt((vpEl.textContent || "").trim(), 10);
      return Number.isFinite(vp) ? vp : "";
    }
    return "";
  }

  function allocGameId() {
    try {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      const big =
        (BigInt(Date.now()) << 32n) ^ (BigInt(a[0]) << 16n) ^ BigInt(a[1]);
      return Number((big % 900000000000000n) + 100000000000000n);
    } catch {
      return Math.floor(100000000000000 + Math.random() * 900000000000000);
    }
  }

  let gameId = allocGameId();
  let turnNumber = 0;

  function isRollEvent_(evt) {
    if (!evt || !evt.resource || typeof evt.resource !== "object") return false;
    if (
      evt.resource.roll_total !== undefined &&
      evt.resource.roll_total !== null
    )
      return true;
    if (Array.isArray(evt.resource.dice) && evt.resource.dice.length >= 2)
      return true;
    return false;
  }

  let sendQueue = Promise.resolve();
  function sendRowAsync(row) {
    return new Promise((resolve) => {
      const rt =
        globalThis.chrome?.runtime?.sendMessage ||
        globalThis.browser?.runtime?.sendMessage;
      if (!rt) {
        warn("chrome.runtime.sendMessage not available; cannot POST", row);
        resolve(null);
        return;
      }
      rt.call(
        globalThis.chrome?.runtime || globalThis.browser?.runtime,
        { type: "POST_TURN_EVENTS", record: row },
        (resp) => {
          const err =
            globalThis.chrome?.runtime?.lastError ||
            globalThis.browser?.runtime?.lastError;
          if (err) warn("sendMessage error:", err.message || err);
          resolve(resp);
        }
      );
    });
  }

  function formatResourceForOverlay(resource) {
    if (!resource) return "";
    if (typeof resource === "string") return resource;
    try {
      if (
        resource &&
        typeof resource === "object" &&
        !Array.isArray(resource)
      ) {
        const parts = [];
        for (const k of RES_KEYS) {
          const v = resource[k];
          if (!v) continue;
          parts.push(v > 0 ? `+${k}${v}` : `-${k}${Math.abs(v)}`);
        }
        if (parts.length) return parts.join(" ");
      }
      return JSON.stringify(resource);
    } catch {
      return String(resource);
    }
  }

  let lastLogIndex = -1;

  function createOverlay() {
    if (!OVERLAY_ENABLED) return null;
    const id = "__ctl_overlay";
    const existing = document.getElementById(id);
    if (existing) return existing;

    const root = document.createElement("div");
    root.id = id;
    root.style.position = "fixed";
    root.style.top = "12px";
    root.style.right = "12px";
    root.style.width = `${OVERLAY_WIDTH_PX}px`;
    root.style.maxHeight = "70vh";
    root.style.zIndex = "2147483647";
    root.style.background = "rgba(15, 15, 18, 0.88)";
    root.style.border = "1px solid rgba(255,255,255,0.15)";
    root.style.borderRadius = "10px";
    root.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";
    root.style.backdropFilter = "blur(6px)";
    root.style.color = "rgba(255,255,255,0.95)";
    root.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    root.style.overflow = "hidden";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "10px 12px";
    header.style.borderBottom = "1px solid rgba(255,255,255,0.12)";

    const title = document.createElement("div");
    title.style.fontSize = "13px";
    title.style.fontWeight = "700";
    title.textContent = "Colonist Turn Logger";

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.style.opacity = "0.85";
    status.textContent = "";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "8px";

    const btnClear = document.createElement("button");
    btnClear.textContent = "Clear";
    btnClear.style.cursor = "pointer";
    btnClear.style.fontSize = "12px";
    btnClear.style.padding = "6px 8px";
    btnClear.style.borderRadius = "8px";
    btnClear.style.border = "1px solid rgba(255,255,255,0.18)";
    btnClear.style.background = "rgba(255,255,255,0.06)";
    btnClear.style.color = "rgba(255,255,255,0.92)";

    const btnMin = document.createElement("button");
    btnMin.textContent = "Min";
    btnMin.style.cursor = "pointer";
    btnMin.style.fontSize = "12px";
    btnMin.style.padding = "6px 8px";
    btnMin.style.borderRadius = "8px";
    btnMin.style.border = "1px solid rgba(255,255,255,0.18)";
    btnMin.style.background = "rgba(255,255,255,0.06)";
    btnMin.style.color = "rgba(255,255,255,0.92)";

    controls.appendChild(btnClear);
    controls.appendChild(btnMin);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "2px";
    left.appendChild(title);
    left.appendChild(status);

    header.appendChild(left);
    header.appendChild(controls);

    const list = document.createElement("div");
    list.style.padding = "8px 10px";
    list.style.maxHeight = "calc(70vh - 52px)";
    list.style.overflowY = "auto";
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    root.appendChild(header);
    root.appendChild(list);
    document.documentElement.appendChild(root);

    let minimized = false;
    btnMin.onclick = () => {
      minimized = !minimized;
      list.style.display = minimized ? "none" : "flex";
      btnMin.textContent = minimized ? "Show" : "Min";
    };
    btnClear.onclick = () => {
      list.innerHTML = "";
    };

    function setHeader() {
      status.textContent = `game ${gameId} | turn ${turnNumber} | idx ${lastLogIndex}`;
    }

    function addLineFromEvent(evt) {
      const row = document.createElement("div");
      row.style.padding = "8px 8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid rgba(255,255,255,0.10)";
      row.style.background = "rgba(255,255,255,0.04)";

      const top = document.createElement("div");
      top.style.display = "flex";
      top.style.alignItems = "baseline";
      top.style.justifyContent = "space-between";
      top.style.gap = "10px";

      const left = document.createElement("div");
      left.style.fontSize = "12.5px";
      left.style.fontWeight = "650";
      const subj = evt.subject || "";
      const vpText =
        evt.vp === "" || evt.vp === null || evt.vp === undefined
          ? ""
          : ` (VP ${evt.vp})`;
      const obj = evt.object ? ` → ${evt.object}` : "";
      left.textContent = `T${evt.turn_number} ${subj}${vpText}${obj}`;

      const act = document.createElement("div");
      act.style.fontSize = "12px";
      act.style.opacity = "0.9";
      act.textContent = evt.action || "";

      top.appendChild(left);
      top.appendChild(act);

      const res = document.createElement("div");
      res.style.marginTop = "4px";
      res.style.fontSize = "12px";
      res.style.opacity = "0.9";
      const rs = formatResourceForOverlay(evt.resource);
      res.textContent = rs ? rs : "";

      row.appendChild(top);
      if (rs) row.appendChild(res);

      list.prepend(row);
      while (list.childElementCount > OVERLAY_MAX_ROWS)
        list.removeChild(list.lastElementChild);
    }

    function addLine(text) {
      const row = document.createElement("div");
      row.style.padding = "8px 8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid rgba(255,255,255,0.10)";
      row.style.background = "rgba(255,255,255,0.04)";
      row.style.fontSize = "12px";
      row.style.opacity = "0.92";
      row.textContent = text;
      list.prepend(row);
      while (list.childElementCount > OVERLAY_MAX_ROWS)
        list.removeChild(list.lastElementChild);
    }

    return { setHeader, addLineFromEvent, addLine };
  }

  const overlay = createOverlay();

  function emitBatch_(events) {
    for (const e of events) {
      overlay?.addLineFromEvent?.(e);
      sendQueue = sendQueue.then(() => sendRowAsync(e));
    }
    overlay?.setHeader?.();
  }

  function normalizeTurnEvents_(events) {
    let rollIdx = -1;
    for (let i = 0; i < events.length; i++) {
      if (isRollEvent_(events[i])) {
        rollIdx = i;
        break;
      }
    }
    let ordered = events;
    if (rollIdx > 0)
      ordered = [
        events[rollIdx],
        ...events.slice(0, rollIdx),
        ...events.slice(rollIdx + 1),
      ];

    const out = [];
    for (const e of ordered) {
      if (
        e &&
        e.action === "accept_trade" &&
        out.length &&
        out[out.length - 1].action === "receive"
      ) {
        out.pop();
      }
      out.push(e);
    }
    return out;
  }

  function parseEventFromLogNode(node) {
    const msg = node.querySelector("span[class*='messagePart']") || node;
    const raw = (msg.innerText || msg.textContent || "").trim();
    if (!raw) return null;

    const text = raw.replace(/\s+/g, " ");
    const lower = text.toLowerCase();

    let { actor, partner } = extractNamesFromMessage(msg);
    actor = normalizeActor(actor);
    partner = normalizeActor(partner);

    const vp = getVpForPlayerName(actor || "");

    if (
      lower.includes("happy settling") ||
      lower.includes("learn how to play") ||
      lower.includes("rulebook") ||
      lower.includes("list of commands")
    )
      return null;
    if (lower.includes("wants to give") && lower.includes(" for ")) return null;

    if (lower.includes("discard")) {
      const bag = bagFromAllImages(msg);
      if (bagHasAny(bag)) {
        const delta = emptyBag();
        addBag(delta, bag, -1);
        return {
          game_id: gameId,
          turn_number: 0,
          subject: actor || "",
          object: "",
          action: "discard",
          resource: delta,
          vp,
        };
      }
    }

    if (
      lower.includes(" gave ") &&
      lower.includes(" and got ") &&
      lower.includes(" from ")
    ) {
      const { giveBag, getBag } = splitImagesGiveGetByTextPositions(
        msg,
        "gave",
        "and got",
        "from"
      );
      const delta = emptyBag();
      addBag(delta, giveBag, -1);
      addBag(delta, getBag, +1);
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: partner || "",
        action: "accept_trade",
        resource: delta,
        vp,
      };
    }

    if (lower.includes("built a road")) {
      const delta = emptyBag();
      addBag(delta, BUILD_COST.road, -1);
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "build_road",
        resource: delta,
        vp,
      };
    }

    if (lower.includes("built a settlement")) {
      const delta = emptyBag();
      addBag(delta, BUILD_COST.settlement, -1);
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "build_settlement",
        resource: delta,
        vp,
      };
    }

    if (lower.includes("built a city")) {
      const delta = emptyBag();
      addBag(delta, BUILD_COST.city, -1);
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "build_city",
        resource: delta,
        vp,
      };
    }

    const boughtLabel = detectDevPurchaseLabel(msg);
    if (/\bbought\b/i.test(text) && boughtLabel) {
      const delta = emptyBag();
      addBag(delta, BUILD_COST.dev, -1);
      delta.bought = boughtLabel;
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "buy_dev_card",
        resource: delta,
        vp,
      };
    }

    if (lower.includes("placed a road"))
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "place_road",
        resource: "",
        vp,
      };
    if (lower.includes("placed a settlement"))
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "place_settlement",
        resource: "",
        vp,
      };
    if (lower.includes("placed a city"))
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "place_city",
        resource: "",
        vp,
      };

    if (lower.includes("stole") && lower.includes("from")) {
      const thiefTok = (text.match(/^(\S+)/) || [null, null])[1];
      const victimTok = (text.match(/ from (\S+)/i) || [null, null])[1];
      const thief = normalizeActor(thiefTok);
      const victim = normalizeActor(
        victimTok ? victimTok.replace(/[.!?]$/, "") : null
      );

      const me = detectSelfName();
      const bag = bagFromAllImages(msg);
      const keys = RES_KEYS.filter((r) => (bag[r] || 0) > 0);
      const stolenRes = keys.length === 1 ? keys[0] : null;

      if (me && thief === me) {
        const delta = stolenRes ? { [stolenRes]: 1 } : { unknown: 1 };
        return {
          game_id: gameId,
          turn_number: 0,
          subject: me,
          object: victim || "",
          action: "rob",
          resource: delta,
          vp: getVpForPlayerName(me) || vp,
        };
      }

      if (me && victim === me) {
        const delta = stolenRes ? { [stolenRes]: -1 } : { unknown: -1 };
        return {
          game_id: gameId,
          turn_number: 0,
          subject: me,
          object: thief || "",
          action: "rob",
          resource: delta,
          vp: getVpForPlayerName(me) || vp,
        };
      }

      return {
        game_id: gameId,
        turn_number: 0,
        subject: thief || actor || "",
        object: victim || partner || "",
        action: "rob",
        resource: "",
        vp,
      };
    }

    const dice = readDiceFromNode(msg);
    if ((/\brolled\b/i.test(text) || dice) && dice && dice.length >= 2) {
      const d1 = dice[0];
      const d2 = dice[1];
      const total = d1 + d2;
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "other",
        resource: { text, dice: [d1, d2], roll_total: total },
        vp,
      };
    }

    const usedDev = detectUsedDevCard(node) || detectUsedDevCard(msg);
    if (/\bused\b/i.test(text) && usedDev) {
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "other",
        resource: { text, dev_card: usedDev },
        vp,
      };
    }

    const gain = bagFromAllImages(msg);
    if (bagHasAny(gain)) {
      if (
        lower.includes(" gave ") &&
        (lower.includes(" got ") || lower.includes(" and got "))
      )
        return null;
      return {
        game_id: gameId,
        turn_number: 0,
        subject: actor || "",
        object: "",
        action: "receive",
        resource: gain,
        vp,
      };
    }

    return {
      game_id: gameId,
      turn_number: 0,
      subject: actor || "",
      object: partner || "",
      action: "other",
      resource: { text },
      vp,
    };
  }

  function isTurnDelimiter(node) {
    const msg = node.querySelector("span[class*='messagePart']") || node;
    return !!msg.querySelector("hr");
  }

  let turnBuffer = [];
  let lastBufferActivityAt = 0;

  function flushTurnBuffer_() {
    if (!turnBuffer.length) return;
    turnNumber += 1;
    for (const e of turnBuffer) e.turn_number = turnNumber;
    emitBatch_(normalizeTurnEvents_(turnBuffer));
    turnBuffer = [];
    lastBufferActivityAt = 0;
    overlay?.setHeader?.();
  }

  let logRoot = null;
  let logScroller = null;
  let logObserver = null;

  let lastKey = `${location.origin}${location.pathname}${location.hash}`;

  function startNewGame(reason) {
    flushTurnBuffer_();
    gameId = allocGameId();
    turnNumber = 0;
    turnBuffer = [];
    lastBufferActivityAt = 0;
    lastLogIndex = -1;
    log("NEW GAME", { gameId, reason, url: location.href });
    overlay?.addLine?.(`NEW GAME (${reason})`);
    overlay?.setHeader?.();
  }

  function findLogRoot() {
    return document.querySelector(LOG_ROOT_SELECTOR);
  }

  function findLogScroller() {
    if (!logRoot) return null;
    const vs = logRoot.querySelector("div[class*='virtualScroller']");
    if (vs) return vs;
    const divs = logRoot.querySelectorAll("div");
    for (const d of divs) {
      if (d.querySelector("div[data-index]")) return d;
    }
    return null;
  }

  function handleLogNode(node) {
    if (isTurnDelimiter(node)) {
      flushTurnBuffer_();
      return;
    }

    const evt = parseEventFromLogNode(node);
    if (!evt) return;

    if (isRollEvent_(evt) && turnBuffer.some((e) => isRollEvent_(e))) {
      flushTurnBuffer_();
    }

    turnBuffer.push(evt);
    lastBufferActivityAt = Date.now();
  }

  function processLogs() {
    const key = `${location.origin}${location.pathname}${location.hash}`;
    if (key !== lastKey) {
      lastKey = key;
      startNewGame("url_changed");
      logRoot = null;
      logScroller = null;
      return;
    }

    if (!logRoot || !document.contains(logRoot)) {
      const maybe = findLogRoot();
      if (!maybe) return;
      logRoot = maybe;
      logScroller = null;
    }

    if (!logScroller || !document.contains(logScroller)) {
      logScroller = findLogScroller();
      if (!logScroller) return;
    }

    const items = [...logScroller.querySelectorAll("div[data-index]")];
    if (!items.length) return;

    const pairs = [];
    for (const el of items) {
      const idx = +el.getAttribute("data-index");
      if (Number.isFinite(idx)) pairs.push([idx, el]);
    }
    if (!pairs.length) return;

    pairs.sort((a, b) => a[0] - b[0]);
    const minIdx = pairs[0][0];
    const maxIdx = pairs[pairs.length - 1][0];

    if (lastLogIndex !== -1 && maxIdx < lastLogIndex - 50) {
      startNewGame("feed_reset");
      return;
    }

    for (const [idx, node] of pairs) {
      if (idx <= lastLogIndex) continue;
      lastLogIndex = idx;
      handleLogNode(node);
    }

    if (
      turnBuffer.length &&
      lastBufferActivityAt &&
      Date.now() - lastBufferActivityAt > TURN_IDLE_FLUSH_MS
    ) {
      flushTurnBuffer_();
    }

    overlay?.setHeader?.();
  }

  function setupLogObserver() {
    const root = findLogRoot();
    if (!root) return;

    logRoot = root;
    logScroller = findLogScroller();

    if (logObserver) logObserver.disconnect();
    logObserver = new MutationObserver(() => processLogs());
    logObserver.observe(logRoot, { childList: true, subtree: true });
  }

  function init() {
    log("content.js init", { url: location.href, gameId, turnNumber });
    detectSelfName();
    overlay?.setHeader?.();
    setupLogObserver();
    processLogs();

    setInterval(() => {
      if (!logRoot || !document.contains(logRoot)) setupLogObserver();
      processLogs();
    }, TICK_MS);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
