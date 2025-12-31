console.log("[CTL] background.js loaded");

const DEBUG = true;

const KEY_WEB_APP_URL = "CTL_WEB_APP_URL";

const WEB_APP_URL_FALLBACK =
  "https://script.google.com/macros/s/AKfycbwtAgJHwN7nY-xYeCc6qiK7LhiTtxZHeRvCXjpt6nQ4a6JE1FpjZpWnatvyrUVgyyV0QA/exec";

function log(...args) {
  if (DEBUG) console.log("[CTL]", ...args);
}
function warn(...args) {
  console.warn("[CTL]", ...args);
}

async function getWebAppUrl() {
  try {
    const raw = await chrome.storage.local.get([KEY_WEB_APP_URL]);
    const stored = String(raw[KEY_WEB_APP_URL] || "").trim();
    if (stored) return stored;
  } catch (e) {}

  const fallback = String(WEB_APP_URL_FALLBACK || "").trim();
  if (fallback && fallback.includes("/exec")) return fallback;

  return null;
}

async function postToWebApp(webAppUrl, record) {
  if (!webAppUrl) throw new Error("WEB_APP_URL is null/empty");
  if (!webAppUrl.includes("/exec")) {
    throw new Error(`WEB_APP_URL must include /exec. Got: ${webAppUrl}`);
  }

  const res = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record }),
    mode: "cors",
    cache: "no-store",
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}` };
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  if (!json.ok)
    throw new Error(`AppsScript error: ${json.error || text.slice(0, 200)}`);

  return json;
}

chrome.runtime.onInstalled.addListener(() => {
  log("onInstalled");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;
    if (msg.type === "CTL_SET_WEB_APP_URL") {
      const u = String(msg.webAppUrl || "").trim();
      await chrome.storage.local.set({ [KEY_WEB_APP_URL]: u });
      sendResponse({ ok: true, webAppUrl: u });
      return;
    }

    if (
      msg.type === "POST_EVENT_RECORD" ||
      msg.type === "POST_TURN_RECORD" ||
      msg.type === "POST_TURN_EVENTS"
    ) {
      const record = msg.record;
      const webAppUrl = await getWebAppUrl();

      log("onMessage", msg.type, "from", sender?.url || "(no sender url)");
      log("posting", webAppUrl, record?.game_id, record?.turn_number);

      if (!webAppUrl) {
        sendResponse({
          ok: false,
          error:
            "WEB_APP_URL is not set. Set WEB_APP_URL_FALLBACK in background.js or store CTL_WEB_APP_URL in chrome.storage.local.",
        });
        return;
      }

      try {
        const resp = await postToWebApp(webAppUrl, record);
        log("post result", resp);
        sendResponse({ ok: true, ...resp });
      } catch (e) {
        warn("post failed", e);
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }
  })().catch((e) => {
    warn("handler crashed", e);
    sendResponse({ ok: false, error: String(e) });
  });

  return true;
});
