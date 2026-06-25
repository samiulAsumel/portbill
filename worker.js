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
//   GET  /config                  → read config.json from portbill-data
//   PUT  /config                  → write config.json to portbill-data (creates commit)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Map URL path to filename in portbill-data repo
const PATH_TO_FILE = {
  "/rotations": "rotations.json",
  "/saved-bills": "saved-bills.json",
  "/config": "config.json",
};

const COMMIT_MESSAGES = {
  "rotations.json": { put: "feat(rotations): update rotations" },
  "saved-bills.json": { put: "feat(saved-bills): update saved bills" },
  "config.json": { put: "chore(config): update config" },
};

export default {
  async fetch(request, env) {
    const TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;
    const OWNER = env.REPO_OWNER || "samiulAsumel";
    const REPO  = env.REPO_NAME  || "portbill-data";
    const BRANCH = env.BRANCH   || "main";

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Check known route
    const filename = PATH_TO_FILE[path];
    if (!filename) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

    // ── GET ──────────────────────────────────────────────────────────────────
    if (method === "GET") {
      const ghResp = await fetch(`${apiBase}?ref=${BRANCH}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!ghResp.ok) {
        const body = await ghResp.text();
        return new Response(JSON.stringify({ error: "GitHub error", detail: body }), {
          status: ghResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const data = await ghResp.json();
      const content = atob(data.content.replace(/\n/g, ""));
      return new Response(content, {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (method === "PUT") {
      const body = await request.text();

      // Validate JSON
      try { JSON.parse(body); } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Get current SHA
      const shaResp = await fetch(`${apiBase}?ref=${BRANCH}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      let sha = null;
      if (shaResp.ok) {
        const shaData = await shaResp.json();
        sha = shaData.sha;
      } else if (shaResp.status !== 404) {
        const errBody = await shaResp.text();
        return new Response(JSON.stringify({ error: "GitHub SHA fetch error", detail: errBody }), {
          status: shaResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const encoded = btoa(unescape(encodeURIComponent(body)));
      const commitMsg = COMMIT_MESSAGES[filename]?.put || `update ${filename}`;

      const putPayload = {
        message: commitMsg,
        content: encoded,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      };

      const putResp = await fetch(apiBase, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(putPayload),
      });

      if (!putResp.ok) {
        const errBody = await putResp.text();
        return new Response(JSON.stringify({ error: "GitHub PUT error", detail: errBody }), {
          status: putResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const putData = await putResp.json();
      return new Response(
        JSON.stringify({ ok: true, sha: putData.content?.sha, commit: putData.commit?.sha }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
