const { app, BrowserWindow, ipcMain, dialog, session: electronSession } = require("electron");
const path = require("path");

let Store = null;
let store = null;
let mainWindow = null;
let loginWindow = null;
const isDev = process.env.NODE_ENV === "development";
const isMac = process.platform === "darwin";

// Captured from network requests during login
let capturedBearerToken = null;
let capturedQueryId = null;
let capturedFolderQueryId = null;

// Initialize Store dynamically (it's an ESM module)
async function initStore() {
  if (store) return store;
  const StoreModule = await import("electron-store");
  Store = StoreModule.default;
  store = new Store();
  return store;
}

// Set app name
app.setName("x-canvas");

// Set app ID for Windows
if (process.platform === "win32") {
  app.setAppUserModelId("xcanvas");
  process.env.ELECTRON_APP_NAME = "x-canvas";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Get dev port from environment or default
  const devPort = process.env.VITE_PORT || "5173";
  const startUrl = isDev
    ? `http://localhost:${devPort}`
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  mainWindow.loadURL(startUrl);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.on("ready", async () => {
  await initStore();
  createWindow();

  // Fix CORS for Twitter media (videos + images) so renderer can load them
  electronSession.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://video.twimg.com/*", "https://pbs.twimg.com/*", "https://abs.twimg.com/*"] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      headers["access-control-allow-origin"] = ["*"];
      headers["access-control-allow-methods"] = ["GET, HEAD, OPTIONS"];
      callback({ responseHeaders: headers });
    }
  );

  // Intercept X.com API requests to capture bearer token and query IDs
  electronSession.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["https://x.com/i/api/*", "https://api.x.com/*", "https://twitter.com/i/api/*"] },
    (details, callback) => {
      const auth =
        details.requestHeaders["authorization"] ||
        details.requestHeaders["Authorization"];
      if (auth && auth.startsWith("Bearer ") && auth.length > 20) {
        capturedBearerToken = auth;
      }
      // Capture query ID from Bookmarks API calls
      const bookmarksMatch = details.url.match(/graphql\/([^/]+)\/Bookmarks/);
      if (bookmarksMatch && bookmarksMatch[1]) {
        capturedQueryId = bookmarksMatch[1];
        console.log(`[Electron] Captured Bookmarks query ID: ${capturedQueryId}`);
      }
      // Capture BookmarkFolders query ID
      const foldersMatch = details.url.match(/graphql\/([^/]+)\/BookmarkFolders/);
      if (foldersMatch && foldersMatch[1]) {
        capturedFolderQueryId = foldersMatch[1];
        console.log(`[Electron] Captured BookmarkFolders query ID: ${capturedFolderQueryId}`);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );
});

app.on("window-all-closed", () => {
  if (!isMac) {
    // Keep app running
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle("get-session-cookie", async () => {
  return store.get("sessionCookie", "");
});

ipcMain.handle("set-session-cookie", async (_, cookie) => {
  store.set("sessionCookie", cookie);
  return true;
});

ipcMain.handle("open-login-window", async () => {
  return new Promise((resolve) => {
    if (loginWindow) {
      loginWindow.focus();
      return resolve({ success: false, error: "Login window already open" });
    }

    loginWindow = new BrowserWindow({
      width: 600,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Use same session as main window so cookies are shared
        session: electronSession.defaultSession,
      },
    });

    // Load X.com login page
    loginWindow.loadURL("https://x.com/i/flow/login");

    // Monitor for successful login by checking cookies
    const checkLoginInterval = setInterval(async () => {
      if (!loginWindow) {
        clearInterval(checkLoginInterval);
        return;
      }

      const cookies = await loginWindow.webContents.session.cookies.get({
        url: "https://x.com",
      });

      // Look for X.com auth cookies
      const authToken = cookies.find((c) => c.name === "auth_token");
      const ct0 = cookies.find((c) => c.name === "ct0");

      if (authToken && ct0) {
        // Build the full cookie string
        const cookieString = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");

        // Save it
        store.set("sessionCookie", cookieString);

        // Close the login window
        clearInterval(checkLoginInterval);
        if (loginWindow) {
          loginWindow.close();
          loginWindow = null;
        }

        resolve({ success: true, cookie: cookieString });
      }
    }, 1000); // Check every second

    loginWindow.on("closed", () => {
      clearInterval(checkLoginInterval);
      loginWindow = null;
      resolve({ success: false, error: "Login window closed" });
    });
  });
});

ipcMain.handle("logout", async () => {
  store.delete("sessionCookie");
  capturedBearerToken = null;
  return { success: true };
});

// ─── PRIMARY method: load the real X.com bookmarks page, use CDP to capture
// every GraphQL /Bookmarks response body, and scroll to trigger all pages.
// This is the most reliable approach because X.com's own JS handles auth.
async function captureAllBookmarksViaCDP(sess) {
  return new Promise((resolve) => {
    console.log("[Electron] CDP capture: loading x.com/i/bookmarks...");

    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: sess,
      },
    });

    const allBookmarks = [];
    const seenIds = new Set();
    let resolved = false;
    let scrollInterval = null;
    let stableCount = 0;
    let lastBookmarkCount = 0;

    const finish = (reason) => {
      if (resolved) return;
      resolved = true;
      clearInterval(scrollInterval);
      clearTimeout(hardTimeout);
      try { win.webContents.debugger.detach(); } catch (_) {}
      win.destroy();
      console.log(`[Electron] CDP done (${reason}): ${allBookmarks.length} total bookmarks`);
      resolve(allBookmarks);
    };

    // Hard timeout — 90 seconds max
    const hardTimeout = setTimeout(() => finish("timeout"), 90000);

    // Attach CDP debugger and enable Network domain
    try {
      win.webContents.debugger.attach("1.3");
    } catch (e) {
      console.error("[Electron] CDP attach failed:", e.message);
      resolve([]);
      return;
    }

    // Listen for network responses
    win.webContents.debugger.on("message", async (_event, method, params) => {
      if (method !== "Network.responseReceived") return;
      const url = params.response?.url || "";
      if (!url.includes("/Bookmarks") || !url.includes("/graphql/")) return;

      // Capture query ID
      const qm = url.match(/graphql\/([^/?]+)\/Bookmarks/);
      if (qm) capturedQueryId = qm[1];

      // Also capture bearer token from response headers
      const auth = params.response?.requestHeaders?.authorization || params.response?.requestHeaders?.Authorization;
      if (auth && auth.startsWith("Bearer ")) capturedBearerToken = auth;

      try {
        const body = await win.webContents.debugger.sendCommand("Network.getResponseBody", {
          requestId: params.requestId,
        });
        const raw = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        if (!raw) return;

        const data = JSON.parse(raw);
        const { bookmarks: pageBMs } = parseGraphQLBookmarks(data, allBookmarks.length);

        let added = 0;
        for (const bm of pageBMs) {
          if (!seenIds.has(bm.id)) {
            seenIds.add(bm.id);
            allBookmarks.push(bm);
            added++;
          }
        }
        console.log(`[Electron] CDP intercepted page: +${added} new (total=${allBookmarks.length})`);
      } catch (e) {
        console.error("[Electron] CDP body read error:", e.message);
      }
    });

    win.webContents.debugger.sendCommand("Network.enable").catch(console.error);

    win.webContents.on("did-finish-load", () => {
      console.log("[Electron] Page loaded, starting scroll loop...");

      // Scroll down every 1.5s to trigger infinite loading
      scrollInterval = setInterval(async () => {
        if (resolved) return;
        try {
          await win.webContents.executeJavaScript(
            "window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })"
          );
        } catch (_) {}

        const current = allBookmarks.length;
        if (current === lastBookmarkCount) {
          stableCount++;
          console.log(`[Electron] No new bookmarks for ${stableCount}s (total=${current})`);
          // After 8 stable seconds with at least some bookmarks, or 15 stable seconds total, stop
          if ((stableCount >= 8 && current > 0) || stableCount >= 15) {
            finish("stable");
          }
        } else {
          stableCount = 0;
          lastBookmarkCount = current;
        }
      }, 1500);
    });

    win.on("closed", () => finish("window-closed"));
    win.webContents.loadURL("https://x.com/i/bookmarks");
  });
}

async function ensureBearerToken(sess) {
  if (capturedBearerToken) return capturedBearerToken;
  // Load the page briefly to capture the bearer token
  const bookmarks = await captureAllBookmarksViaCDP(sess);
  return capturedBearerToken;
}

// Discover the current Bookmarks GraphQL query ID from X.com's JS bundles
async function discoverQueryId(sess, cookieStr, bearerToken) {
  try {
    console.log("[Electron] Discovering current Bookmarks query ID...");
    const homeRes = await sess.fetch("https://x.com/", {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        cookie: cookieStr,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await homeRes.text();

    // Find main JS bundle URLs
    const scriptMatches = html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"']+\.js/g) || [];
    const webpackMatches = html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"']+\.js/g) || [];
    const allScripts = [...new Set([...scriptMatches, ...webpackMatches])].slice(0, 10);

    console.log(`[Electron] Found ${allScripts.length} JS bundles to search`);

    for (const scriptUrl of allScripts) {
      try {
        const scriptRes = await sess.fetch(scriptUrl, {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        const js = await scriptRes.text();

        // Search for Bookmarks query ID
        const patterns = [
          /queryId:"([A-Za-z0-9_-]{22,})",operationName:"Bookmarks"/,
          /"queryId":"([A-Za-z0-9_-]{22,})","operationName":"Bookmarks"/,
          /([A-Za-z0-9_-]{22,})"[,}].*?"Bookmarks"/,
        ];

        for (const pattern of patterns) {
          const m = js.match(pattern);
          if (m && m[1]) {
            console.log(`[Electron] Found Bookmarks query ID: ${m[1]} in ${scriptUrl}`);
            return m[1];
          }
        }
      } catch (e) {
        // skip this bundle
      }
    }
  } catch (e) {
    console.error("[Electron] Query ID discovery failed:", e.message);
  }
  return null;
}

ipcMain.handle("fetch-bookmarks", async (_, cookie) => {
  console.log("[Electron] Fetching bookmarks — primary: CDP page capture");

  try {
    const sess = mainWindow
      ? mainWindow.webContents.session
      : electronSession.defaultSession;

    // ── STEP 1: CDP capture (most reliable — uses X.com's own JS + scrolls) ─
    let bookmarks = await captureAllBookmarksViaCDP(sess);
    console.log(`[Electron] CDP capture returned ${bookmarks.length} bookmarks`);

    // ── STEP 2: Fallback — manual GraphQL pagination if CDP got < 10 ────────
    if (bookmarks.length < 10) {
      console.log("[Electron] CDP got too few, falling back to manual GraphQL pagination...");

      const sessionCookies = await sess.cookies.get({ url: "https://x.com" });
      const ct0 = sessionCookies.find(c => c.name === "ct0")?.value || extractCt0FromString(cookie);
      const cookieStr = sessionCookies.length > 0
        ? sessionCookies.map(c => `${c.name}=${c.value}`).join("; ")
        : cookie || "";

      const bearerToken = capturedBearerToken ||
        "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

      const discoveredId = await discoverQueryId(sess, cookieStr, bearerToken);
      const queryIds = [capturedQueryId, discoveredId,
        "Fy0QMy4q_aZCpkO0PnyLYw", "HuTx74BxAnezK1D2HLp9-A", "Uv_m_cBXJL1lVXcgX0-u8Q",
      ].filter(Boolean);

      for (const queryId of queryIds) {
        try {
          const gqlBMs = await fetchBookmarksGraphQL(sess, queryId, cookieStr, ct0, bearerToken);
          if (gqlBMs.length > bookmarks.length) {
            bookmarks = gqlBMs;
            console.log(`[Electron] Fallback GraphQL got ${bookmarks.length} bookmarks`);
            break;
          }
        } catch (e) {
          console.log(`[Electron] Fallback queryId=${queryId} failed:`, e.message);
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    bookmarks = bookmarks.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
    console.log("[Electron] Final bookmark count (deduplicated):", bookmarks.length);

    // Try to fetch user's lists/collections
    let collections = [
      {
        id: "default",
        name: "All Bookmarks",
        color: "#007bff",
        createdAt: new Date().toISOString(),
      },
    ];

    try {
      const folders = await fetchBookmarkFolders(sess, bearerToken, cookieStr, ct0);
      if (folders.length > 0) {
        collections = [...collections, ...folders];
        console.log(`[Electron] Returning ${collections.length} collections (default + ${folders.length} bookmark folders)`);
      }
    } catch (e) {
      console.log("[Electron] Could not fetch bookmark folders, using default folder only:", e.message);
    }

    return {
      success: true,
      data: {
        bookmarks: bookmarks.length > 0 ? bookmarks : createSampleBookmarks(),
        collections,
      },
    };
  } catch (error) {
    console.error("[Electron] Error fetching bookmarks:", error.message, error.stack);

    return {
      success: true,
      data: {
        bookmarks: createSampleBookmarks(),
        collections: [
          {
            id: "default",
            name: "All Bookmarks",
            color: "#007bff",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    };
  }
});

function extractCt0FromString(cookie) {
  if (!cookie) return "";
  const match = cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  return match ? match[1] : "";
}

const GRAPHQL_FEATURES = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_has_subtext_notes_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  articles_preview_enabled: true,
};

async function fetchBookmarksGraphQL(sess, queryId, cookieStr, ct0, bearerToken) {
  const url = `https://x.com/i/api/graphql/${queryId}/Bookmarks`;
  const headers = {
    authorization: bearerToken,
    "x-csrf-token": ct0,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    cookie: cookieStr,
    "content-type": "application/json",
    referer: "https://x.com/i/bookmarks",
    origin: "https://x.com",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  const allBookmarks = [];
  let cursor = null;
  let page = 0;
  const MAX_PAGES = 20; // safety cap — 20 pages × ~20 tweets = up to 400 bookmarks

  while (page < MAX_PAGES) {
    page++;
    const body = {
      variables: {
        count: 20,
        cursor: cursor,         // null on first page, token on subsequent pages
        includePromotedContent: false,
        withBirdwatchNotes: false,
        withClientEventToken: false,
        withVoice: true,
        withV2Timeline: true,
      },
      features: GRAPHQL_FEATURES,
    };

    console.log(`[Electron] Fetching bookmarks page ${page}, cursor=${cursor ? cursor.substring(0, 30) + "…" : "null"}`);

    const response = await sess.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    console.log(`[Electron] Page ${page} status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Electron] Page ${page} error:`, text.substring(0, 300));
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const text = await response.text();
    const data = JSON.parse(text);

    const { bookmarks: pageBMs, nextCursor } = parseGraphQLBookmarks(data, allBookmarks.length);
    console.log(`[Electron] Page ${page}: got ${pageBMs.length} bookmarks, nextCursor=${nextCursor ? "yes" : "no"}`);

    allBookmarks.push(...pageBMs);

    // Stop if no more pages, no results on this page, or cursor unchanged
    if (!nextCursor || pageBMs.length === 0 || nextCursor === cursor) {
      console.log(`[Electron] Pagination complete after ${page} pages, total=${allBookmarks.length}`);
      break;
    }

    cursor = nextCursor;

    // Small delay between pages to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return allBookmarks;
}

async function fetchBookmarksV2(sess, cookieStr, ct0, bearerToken) {
  const headers = {
    authorization: bearerToken,
    "x-csrf-token": ct0,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    cookie: cookieStr,
    referer: "https://x.com/i/bookmarks",
    origin: "https://x.com",
    accept: "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  const allBookmarks = [];
  let maxId = null;
  let page = 0;
  const MAX_PAGES = 20;

  while (page < MAX_PAGES) {
    page++;
    const params = new URLSearchParams({ count: "200" });
    if (maxId) params.set("max_id", maxId);
    const url = `https://x.com/i/api/2/timeline/bookmark.json?${params}`;

    console.log(`[Electron] v2 page ${page}: ${url}`);
    const response = await sess.fetch(url, { headers });
    console.log(`[Electron] v2 page ${page} status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const text = await response.text();
    if (!text || text.trim() === "") throw new Error("Empty response body");

    const data = JSON.parse(text);
    const pageBMs = parseV2Bookmarks(data, allBookmarks.length);
    console.log(`[Electron] v2 page ${page}: got ${pageBMs.length} bookmarks`);

    allBookmarks.push(...pageBMs);

    // v2 paginates via max_id — set to lowest tweet id minus 1
    if (pageBMs.length === 0) break;
    const lowestId = pageBMs.reduce((min, b) => {
      const n = BigInt(b.id);
      return n < min ? n : min;
    }, BigInt(pageBMs[0].id));
    const nextMaxId = (lowestId - 1n).toString();
    if (nextMaxId === maxId) break;
    maxId = nextMaxId;

    await new Promise(r => setTimeout(r, 300));
  }

  return allBookmarks;
}

function parseGraphQLBookmarks(data, startIdx = 0) {
  const bookmarks = [];
  let nextCursor = null;

  try {
    // Try all known response structures
    const timeline =
      data?.data?.bookmark_timeline_v2?.timeline ||
      data?.data?.bookmark_timeline?.timeline ||
      data?.data?.bookmarks_timeline?.timeline ||
      data?.data?.user?.result?.timeline_v2?.timeline;

    if (!timeline) {
      console.log("[Electron] No timeline found. Response keys:", Object.keys(data?.data || {}).join(", "));
      return { bookmarks, nextCursor };
    }

    const instructions = timeline.instructions || [];

    for (const instruction of instructions) {
      const allEntries = instruction.entries || [];

      for (const entry of allEntries) {
        // ── Cursor entries (for pagination) ────────────────────────────────
        if (entry?.content?.entryType === "TimelineTimelineCursor" ||
            entry?.content?.__typename === "TimelineTimelineCursor") {
          if (entry.content.cursorType === "Bottom" || entry.entryId?.includes("cursor-bottom")) {
            nextCursor = entry.content.value;
          }
          continue;
        }
        // Also catch cursor in entryId format
        if (entry?.entryId?.startsWith("cursor-bottom")) {
          nextCursor = entry?.content?.value;
          continue;
        }

        try {
          // ── Tweet entries ───────────────────────────────────────────────
          const moduleItems = entry?.content?.items;
          const singleItem = entry?.content?.itemContent;

          const itemContents = moduleItems
            ? moduleItems.map((i) => i?.item?.itemContent).filter(Boolean)
            : singleItem
            ? [singleItem]
            : [];

          for (const itemContent of itemContents) {
            if (!itemContent?.tweet_results) continue;

            const tweetResult = itemContent.tweet_results.result;
            if (!tweetResult) continue;

            // Unwrap TweetWithVisibilityResults and other wrappers
            const tweetData =
              tweetResult.__typename === "Tweet"
                ? tweetResult
                : tweetResult.tweet
                ? tweetResult.tweet
                : tweetResult;

            const legacy = tweetData?.legacy;
            if (!legacy) continue;

            const userResult =
              tweetData?.core?.user_results?.result ||
              tweetResult?.core?.user_results?.result;

            const userLegacy =
              userResult?.__typename === "User"
                ? userResult.legacy
                : userResult?.legacy || userResult;

            const screenName = userLegacy?.screen_name || userResult?.screen_name || "";
            const displayName = userLegacy?.name || userResult?.name || screenName || "Unknown";

            const mediaEntities = legacy.extended_entities?.media || legacy.entities?.media || [];
            const firstMedia = mediaEntities[0] || null;
            const thumbnail = firstMedia?.media_url_https || null;

            let videoUrl = null;
            if (firstMedia && (firstMedia.type === "video" || firstMedia.type === "animated_gif")) {
              const mp4s = (firstMedia.video_info?.variants || []).filter(v => v.content_type === "video/mp4");
              if (mp4s.length > 0) {
                mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                videoUrl = mp4s[0].url;
              }
            }

            bookmarks.push({
              id: legacy.id_str || entry.entryId,
              text: legacy.full_text || legacy.text || "",
              author: screenName || "unknown",
              authorName: displayName,
              authorImage: userLegacy?.profile_image_url_https || null,
              thumbnail,
              videoUrl,
              createdAt: legacy.created_at || new Date().toISOString(),
              url: `https://x.com/${screenName || "i/web"}/status/${legacy.id_str}`,
              position: { x: 0, y: 0 },
              folderId: "default",
            });
          }
        } catch (entryErr) {
          console.error("[Electron] Error parsing entry:", entryErr.message);
        }
      }
    }
  } catch (e) {
    console.error("[Electron] Error parsing GraphQL response:", e.message, e.stack);
  }

  return { bookmarks, nextCursor };
}

function parseV2Bookmarks(data, startIdx = 0) {
  const bookmarks = [];
  try {
    const tweets = data?.globalObjects?.tweets || {};
    const users = data?.globalObjects?.users || {};

    for (const [tweetId, tweet] of Object.entries(tweets)) {
      const user = users[tweet.user_id_str] || {};
      // Extract media
      const mediaEntities = tweet.extended_entities?.media || tweet.entities?.media || [];
      const firstMedia = mediaEntities[0] || null;
      const thumbnail = firstMedia?.media_url_https || null;
      let videoUrl = null;
      if (firstMedia && (firstMedia.type === "video" || firstMedia.type === "animated_gif")) {
        const mp4s = (firstMedia.video_info?.variants || []).filter(v => v.content_type === "video/mp4");
        if (mp4s.length > 0) {
          mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          videoUrl = mp4s[0].url;
        }
      }
      bookmarks.push({
        id: tweetId,
        text: tweet.full_text || tweet.text || "",
        author: user.screen_name || "unknown",
        authorName: user.name || "Unknown",
        authorImage: user.profile_image_url_https || null,
        thumbnail,
        videoUrl,
        createdAt: tweet.created_at || new Date().toISOString(),
        url: `https://x.com/${user.screen_name || "i/web"}/status/${tweetId}`,
        position: { x: 0, y: 0 },
        folderId: "default",
      });
    }
  } catch (e) {
    console.error("[Electron] Error parsing v2 response:", e.message);
  }

  return bookmarks;
}

async function discoverFolderQueryId(sess, cookieStr) {
  // Try to find BookmarkFolders query ID from X.com JS bundles
  try {
    const homeRes = await sess.fetch("https://x.com/i/bookmarks", {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        cookie: cookieStr,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await homeRes.text();
    const scriptUrls = [...new Set(
      (html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"']+\.js/g) || [])
    )].slice(0, 8);

    for (const url of scriptUrls) {
      try {
        const res = await sess.fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        const js = await res.text();
        const patterns = [
          /queryId:"([A-Za-z0-9_-]{20,})",operationName:"BookmarkFolders"/,
          /"queryId":"([A-Za-z0-9_-]{20,})","operationName":"BookmarkFolders"/,
        ];
        for (const p of patterns) {
          const m = js.match(p);
          if (m && m[1]) {
            console.log(`[Electron] Found BookmarkFolders query ID: ${m[1]}`);
            return m[1];
          }
        }
      } catch (_) {}
    }
  } catch (e) {
    console.error("[Electron] discoverFolderQueryId error:", e.message);
  }
  return null;
}

async function fetchBookmarkFolders(sess, bearerToken, cookieStr, ct0) {
  // Build list of query IDs to try (captured > discovered > known fallbacks)
  const discoveredId = await discoverFolderQueryId(sess, cookieStr);
  const queryIds = [
    capturedFolderQueryId,
    discoveredId,
    // Known BookmarkFolders query IDs (rotate periodically — extend as needed)
    "xT36W0ux8-8zGmZFNYUvMQ",
    "4KHZvFHmGxNjmABUxD_mVg",
    "F99EOHhKwulZ_HZpvfPMug",
  ].filter(Boolean);

  console.log(`[Electron] BookmarkFolders: trying ${queryIds.length} query IDs`);

  const headers = {
    authorization: bearerToken,
    "x-csrf-token": ct0 || "",
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    cookie: cookieStr,
    "content-type": "application/json",
    referer: "https://x.com/i/bookmarks",
    origin: "https://x.com",
    accept: "*/*",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  for (const queryId of queryIds) {
    try {
      // BookmarkFolders uses GET with query params
      const params = new URLSearchParams({
        features: JSON.stringify({
          rweb_tipjar_consumption_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          creator_subscriptions_tweet_preview_api_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          tweet_awards_web_tipping_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_enhance_cards_enabled: false,
        }),
      });

      const url = `https://x.com/i/api/graphql/${queryId}/BookmarkFolders?${params}`;
      console.log(`[Electron] GET BookmarkFolders: ${url.substring(0, 80)}...`);

      const response = await sess.fetch(url, { headers });
      console.log(`[Electron] BookmarkFolders status: ${response.status}`);

      if (!response.ok) continue;

      const text = await response.text();
      if (!text) continue;

      const data = JSON.parse(text);
      const folders = parseBookmarkFolders(data);

      if (folders.length > 0) {
        console.log(`[Electron] Found ${folders.length} bookmark folders`);
        return folders;
      }
    } catch (e) {
      console.log(`[Electron] BookmarkFolders queryId=${queryId} failed:`, e.message);
    }
  }

  return [];
}

function parseBookmarkFolders(data) {
  const folders = [];
  try {
    // X.com BookmarkFolders response structure
    // data.data.bookmark_collections_slice.items[] or
    // data.data.bookmark_folders.[] etc.
    const items =
      data?.data?.bookmark_collections_slice?.items ||
      data?.data?.bookmark_folders ||
      data?.data?.bookmarkFolders ||
      [];

    for (const item of items) {
      const folder = item?.folder || item;
      if (!folder || !folder.id) continue;
      folders.push({
        id: folder.id,
        name: folder.name || "Folder",
        color: folder.color || "#888",
        createdAt: new Date().toISOString(),
      });
    }

    // Also check timeline instructions format
    if (folders.length === 0) {
      const instructions =
        data?.data?.bookmark_folders_timeline?.timeline?.instructions ||
        data?.data?.bookmark_collection_home_timeline?.timeline?.instructions ||
        [];
      for (const instr of instructions) {
        for (const entry of (instr.entries || [])) {
          const folder = entry?.content?.itemContent?.bookmark_collection || entry?.content?.itemContent?.folder;
          if (folder && folder.id) {
            folders.push({
              id: folder.id,
              name: folder.name || "Folder",
              color: folder.coverMedia?.media_info?.original_img_url ? undefined : "#888",
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[Electron] parseBookmarkFolders error:", e.message);
  }
  console.log(`[Electron] Parsed ${folders.length} folders from response`);
  return folders;
}

function createSampleBookmarks() {
  return [
    {
      id: "sample1",
      text: "Could not fetch real bookmarks. Please make sure you're logged in to X.com and try syncing again.",
      author: "x-canvas",
      authorName: "x-canvas",
      authorImage: null,
      createdAt: new Date().toISOString(),
      url: "https://x.com",
      position: { x: 100, y: 100 },
      folderId: "default",
    },
  ];
}
