// Cloudflare Worker for portbill-proxy
// Deploy this script to: portbill-proxy.sa-sumel91.workers.dev
// This worker proxies GitHub API requests for the portbill-data repository
//
// IMPORTANT: Add these environment secrets in Cloudflare Worker settings:
//   GH_TOKEN  = your GitHub Personal Access Token (with repo write access)
//   REPO_OWNER = samiulAsumel
//   REPO_NAME  = portbill-data
//   BRANCH    = main
//
// Routes handled:
//   GET  /rotations      → read rotations.json from portbill-data
//   PUT  /rotations      → write rotations.json to portbill-data (creates commit)
//   GET  /saved-bills    → read saved-bills.json from portbill-data
//   PUT  /saved-bills    → write saved-bills.json to portbill-data (creates commit)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Map URL path to filename in portbill-data repo
const PATH_TO_FILE = {
  "/rotations": "rotations.json",
  "/saved-bills": "saved-bills.json",
};

// Commit messages for each file operation
const COMMIT_MESSAGES = {
  "rotations.json": {
    put: "feat(rotations): update registry",
  },
  "saved-bills.json": {
    put: "feat(saved-bills): update saved bills",
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const filename = PATH_TO_FILE[path];
    if (!filename) {
      return new Response(JSON.stringify({ error: "Unknown path: " + path }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const OWNER = env.REPO_OWNER || "samiulAsumel";
    const REPO = env.REPO_NAME || "portbill-data";
    const BRANCH = env.BRANCH || "main";
    const TOKEN = env.GH_TOKEN;
    const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

    const ghHeaders = {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "portbill-worker/1.0",
      "Content-Type": "application/json",
    };

    // GET: read the file from GitHub
    if (request.method === "GET") {
      const resp = await fetch(`${API_BASE}?ref=${BRANCH}`, {
        headers: ghHeaders,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return new Response(errBody, {
          status: resp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const data = await resp.json();
      // Decode base64 content
      const content = atob(data.content.replace(/\n/g, ""));
      return new Response(content, {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // PUT: update the file in GitHub (creates a commit)
    if (request.method === "PUT") {
      const body = await request.text();

      // Get current file SHA (needed for update)
      const currentResp = await fetch(`${API_BASE}?ref=${BRANCH}`, {
        headers: ghHeaders,
      });

      let sha = null;
      if (currentResp.ok) {
        const currentData = await currentResp.json();
        sha = currentData.sha;
      }

      // Encode content to base64
      const encoded = btoa(unescape(encodeURIComponent(body)));

      const commitMsg = COMMIT_MESSAGES[filename]?.put || `update ${filename}`;

      const updateResp = await fetch(API_BASE, {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
          message: commitMsg,
          content: encoded,
          sha: sha,
          branch: BRANCH,
        }),
      });

      if (!updateResp.ok) {
        const errBody = await updateResp.text();
        return new Response(errBody, {
          status: updateResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
