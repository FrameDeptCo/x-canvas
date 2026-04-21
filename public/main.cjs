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

// Intercept the actual bookmark API call from the x.com page and return the parsed bookmarks
async function captureBookmarksFromPage(sess) {
  return new Promise((resolve) => {
    console.log("[Electron] Loading x.com/i/bookmarks to capture API response...");

    const hiddenWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: sess,
      },
    });

    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      hiddenWindow.destroy();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      console.log("[Electron] Page capture timed out");
      done(null);
    }, 30000);

    // Intercept the GraphQL bookmarks & folders responses
    sess.webRequest.onCompleted(
      { urls: ["https://x.com/i/api/graphql/*/*"] },
      async (details) => {
        const bookmarksMatch = details.url.match(/graphql\/([^/]+)\/Bookmarks/);
        if (bookmarksMatch) {
          capturedQueryId = bookmarksMatch[1];
          console.log(`[Electron] Captured Bookmarks query ID: ${capturedQueryId}`);
        }
        const foldersMatch = details.url.match(/graphql\/([^/]+)\/BookmarkFolders/);
        if (foldersMatch) {
          capturedFolderQueryId = foldersMatch[1];
          console.log(`[Electron] Captured BookmarkFolders query ID: ${capturedFolderQueryId}`);
        }
        if (!resolved && (bookmarksMatch || foldersMatch)) {
          setTimeout(() => {
            if (!resolved) done({ queryId: capturedQueryId });
          }, 1500);
        }
      }
    );

    hiddenWindow.on("closed", () => {
      clearTimeout(timeout);
      sess.webRequest.onCompleted(null); // remove listener
      done(null);
    });

    hiddenWindow.loadURL("https://x.com/i/bookmarks");
  });
}

async function ensureBearerToken(sess) {
  if (capturedBearerToken) return capturedBearerToken;
  await captureBookmarksFromPage(sess);
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
  console.log("[Electron] Fetching bookmarks via X.com API");

  try {
    const sess = mainWindow
      ? mainWindow.webContents.session
      : electronSession.defaultSession;

    // Get cookies from session
    const sessionCookies = await sess.cookies.get({ url: "https://x.com" });
    const ct0Cookie = sessionCookies.find((c) => c.name === "ct0");
    const ct0 = ct0Cookie?.value || extractCt0FromString(cookie);

    if (!ct0) {
      console.error("[Electron] No ct0 cookie found - user may not be logged in");
    }

    // Build cookie string: prefer session cookies (most up-to-date)
    const cookieStr =
      sessionCookies.length > 0
        ? sessionCookies.map((c) => `${c.name}=${c.value}`).join("; ")
        : cookie || "";

    console.log("[Electron] ct0:", ct0 ? "found" : "missing");

    // Ensure we have a bearer token by loading X.com if needed
    const capturedToken = await ensureBearerToken(sess);

    // Bearer token - use captured one or well-known fallback
    const bearerToken =
      capturedToken ||
      "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

    console.log("[Electron] Using bearer token:", bearerToken.substring(0, 40) + "...");

    // Discover current query ID, then fall back to known ones
    const discoveredId = await discoverQueryId(sess, cookieStr, bearerToken);
    const queryIds = [
      capturedQueryId,   // intercepted from actual page load
      discoveredId,      // found in JS bundle
      "Fy0QMy4q_aZCpkO0PnyLYw",
      "HuTx74BxAnezK1D2HLp9-A",
      "Uv_m_cBXJL1lVXcgX0-u8Q",
    ].filter(Boolean);
    console.log("[Electron] Query IDs to try:", queryIds);

    let bookmarks = [];

    for (const queryId of queryIds) {
      try {
        bookmarks = await fetchBookmarksGraphQL(sess, queryId, cookieStr, ct0, bearerToken);
        if (bookmarks.length > 0) {
          console.log(`[Electron] Got ${bookmarks.length} bookmarks via GraphQL queryId=${queryId}`);
          break;
        }
      } catch (e) {
        console.log(`[Electron] GraphQL queryId=${queryId} failed:`, e.message);
      }
    }

    // If GraphQL failed, try v2 timeline API
    if (bookmarks.length === 0) {
      try {
        bookmarks = await fetchBookmarksV2(sess, cookieStr, ct0, bearerToken);
        console.log(`[Electron] Got ${bookmarks.length} bookmarks via v2 API`);
      } catch (e) {
        console.error("[Electron] v2 API also failed:", e.message);
      }
    }

    console.log("[Electron] Total bookmarks found:", bookmarks.length);

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

async function fetchBookmarksGraphQL(sess, queryId, cookieStr, ct0, bearerToken) {
  const body = {
    variables: {
      count: 100,
      includePromotedContent: false,
      withBirdwatchNotes: false,
      withClientEventToken: false,
      withVoice: true,
      withV2Timeline: true,
      cursor: null,
    },
    features: {
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
    },
  };

  const url = `https://x.com/i/api/graphql/${queryId}/Bookmarks`;
  console.log(`[Electron] POST GraphQL: ${url}`);

  const response = await sess.fetch(url, {
    method: "POST",
    headers: {
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
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  console.log(`[Electron] GraphQL response status: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Electron] GraphQL error body:`, text.substring(0, 500));
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }

  const text = await response.text();
  console.log(`[Electron] GraphQL response length: ${text.length}, preview: ${text.substring(0, 200)}`);
  const data = JSON.parse(text);
  return parseGraphQLBookmarks(data);
}

async function fetchBookmarksV2(sess, cookieStr, ct0, bearerToken) {
  const url = "https://x.com/i/api/2/timeline/bookmark.json?count=100";

  console.log("[Electron] Calling v2 API:", url);

  const response = await sess.fetch(url, {
    headers: {
      authorization: bearerToken,
      "x-csrf-token": ct0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      cookie: cookieStr,
      referer: "https://x.com/i/bookmarks",
      origin: "https://x.com",
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  console.log(`[Electron] v2 API response status: ${response.status}`);

  const text = await response.text();
  console.log(`[Electron] v2 response length: ${text.length}, preview: ${text.substring(0, 300)}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }

  if (!text || text.trim() === "") {
    throw new Error("Empty response body");
  }

  const data = JSON.parse(text);
  return parseV2Bookmarks(data);
}

function parseGraphQLBookmarks(data, startIdx = 0) {
  const bookmarks = [];
  try {
    console.log("[Electron] Parsing GraphQL response, top-level keys:", Object.keys(data?.data || {}));

    // Try all known response structures
    const timeline =
      data?.data?.bookmark_timeline_v2?.timeline ||
      data?.data?.bookmark_timeline?.timeline ||
      data?.data?.bookmarks_timeline?.timeline ||
      data?.data?.user?.result?.timeline_v2?.timeline;

    if (!timeline) {
      console.log("[Electron] No timeline found. Full response:", JSON.stringify(data).substring(0, 800));
      return bookmarks;
    }

    const instructions = timeline.instructions || [];
    console.log(`[Electron] Found ${instructions.length} instructions`);

    for (const instruction of instructions) {
      const entries = instruction.entries || instruction.entry ? [instruction.entry] : [];
      const allEntries = instruction.entries || [];
      console.log(`[Electron] Instruction type=${instruction.type}, entries=${allEntries.length}`);

      for (const entry of allEntries) {
        try {
          // Handle module items (grouped tweets)
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

            // Try every known path for user data
            const userResult =
              tweetData?.core?.user_results?.result ||
              tweetResult?.core?.user_results?.result;

            // userResult may itself be wrapped (UserUnavailable etc.)
            const userLegacy =
              userResult?.__typename === "User"
                ? userResult.legacy
                : userResult?.legacy || userResult;

            const screenName =
              userLegacy?.screen_name ||
              userResult?.screen_name ||
              "";

            const displayName =
              userLegacy?.name ||
              userResult?.name ||
              screenName ||
              "Unknown";

            const mediaEntities =
              legacy.extended_entities?.media ||
              legacy.entities?.media ||
              [];
            const firstMedia = mediaEntities[0] || null;
            const thumbnail = firstMedia?.media_url_https || null;

            // Extract video URL for animated GIFs and videos
            let videoUrl = null;
            if (firstMedia && (firstMedia.type === 'video' || firstMedia.type === 'animated_gif')) {
              const variants = firstMedia.video_info?.variants || [];
              const mp4s = variants.filter(v => v.content_type === 'video/mp4');
              if (mp4s.length > 0) {
                // Pick highest bitrate
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
              position: { x: 0, y: 0 },   // syncManager computes masonry positions
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

  console.log(`[Electron] Parsed ${bookmarks.length} bookmarks from GraphQL`);
  return bookmarks;
}

function parseV2Bookmarks(data) {
  const bookmarks = [];
  try {
    const tweets = data?.globalObjects?.tweets || {};
    const users = data?.globalObjects?.users || {};

    for (const [tweetId, tweet] of Object.entries(tweets)) {
      const user = users[tweet.user_id_str] || {};
      const idx = bookmarks.length;
      bookmarks.push({
        id: tweetId,
        text: tweet.full_text || tweet.text || "",
        author: user.screen_name || "unknown",
        authorName: user.name || "Unknown",
        authorImage: user.profile_image_url_https || null,
        thumbnail: null,
        createdAt: tweet.created_at || new Date().toISOString(),
        url: `https://x.com/${user.screen_name || "i/web"}/status/${tweetId}`,
        position: {
          x: (idx % 5) * 380 + 50,
          y: Math.floor(idx / 5) * 250 + 50,
        },
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
