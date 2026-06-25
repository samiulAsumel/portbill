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
//   GET  /rotations               → read rotations.json from portbill-data
//   PUT  /rotations               → write rotations.json to portbill-data (creates commit)
//   GET  /saved-bills             → read saved-bills.json from portbill-data
//   PUT  /saved-bills             → write saved-bills.json to portbill-data (creates commit)
//   GET  /saved-bills/history     → list last 13 commits for saved-bills.json
//   GET  /saved-bills/at/:sha     → get saved-bills.json content at a specific commit SHA

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
    update: "feat(rotations): update rotation registry",
  },
  "saved-bills.json": {
    update: "feat(saved-bills): update saved bills",
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

    const OWNER = env.REPO_OWNER || "samiulAsumel";
    const REPO  = env.REPO_NAME  || "portbill-data";
    const BRANCH = env.BRANCH    || "main";
    const TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;

    const ghHeaders = {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "portbill-proxy",
    };

    // ── GET /saved-bills/history ─────────────────────────────────────────────
    if (path === "/saved-bills/history" && request.method === "GET") {
      const commitsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/commits?path=saved-bills.json&sha=${BRANCH}&per_page=13`;
      const resp = await fetch(commitsUrl, { headers: ghHeaders });
      const errBody = await resp.text();
      if (!resp.ok) {
        return new Response(errBody, { status: resp.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const commits = JSON.parse(errBody);
      const history = commits.map(c => ({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author.date,
        author: c.commit.author.name,
      }));
      return new Response(JSON.stringify(history), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── GET /saved-bills/at/:sha ─────────────────────────────────────────────
    if (path.startsWith("/saved-bills/at/") && request.method === "GET") {
      const sha = path.replace("/saved-bills/at/", "").trim();
      if (!sha) {
        return new Response(JSON.stringify({ error: "Missing commit SHA" }), { status: 400, headers: CORS_HEADERS });
      }
      const fileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/saved-bills.json?ref=${sha}`;
      const resp = await fetch(fileUrl, { headers: ghHeaders });
      const errBody = await resp.text();
      if (!resp.ok) {
        return new Response(errBody, { status: resp.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const data = JSON.parse(errBody);
      const content = atob(data.content.replace(/\n/g, ""));
      return new Response(content, {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Generic GET/PUT for /rotations and /saved-bills ──────────────────────
    const filename = PATH_TO_FILE[path];
    if (!filename) {
      return new Response(JSON.stringify({ error: "Unknown path: " + path }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

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
      let sha = undefined;
      if (currentResp.ok) {
        const currentData = await currentResp.json();
        sha = currentData.sha;
      }

      // Encode content to base64
      const encoded = btoa(unescape(encodeURIComponent(body)));
      const commitMsg = COMMIT_MESSAGES[filename]?.update || `feat: update ${filename}`;

      const payload = { message: commitMsg, content: encoded, branch: BRANCH };
      if (sha) payload.sha = sha;

      const updateResp = await fetch(API_BASE, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!updateResp.ok) {
        const errBody = await updateResp.text();
        return new Response(errBody, {
          status: updateResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const result = await updateResp.json();
      return new Response(JSON.stringify({ ok: true, sha: result.content?.sha, commit: result.commit?.sha }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
