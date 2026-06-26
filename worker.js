// Cloudflare Worker for portbill-proxy
// Routes: GET/PUT /rotations, GET/PUT /saved-bills, GET/PUT /config

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PATH_TO_FILE = {
  "/rotations": "rotations.json",
  "/saved-bills": "saved-bills.json",
  "/config": "config.json",
};

const COMMIT_MESSAGES = {
  "rotations.json": "feat(rotations): update rotations",
  "saved-bills.json": "feat(saved-bills): update saved bills",
  "config.json": "chore(config): update config",
};

export default {
  async fetch(request, env) {
    const TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;
    const OWNER = env.REPO_OWNER || "samiulAsumel";
    const REPO = env.REPO_NAME || "portbill-data";
    const BRANCH = env.BRANCH || "main";

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const filename = PATH_TO_FILE[path];
    if (!filename) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const ghHeaders = {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "portbill-proxy-worker/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

    if (method === "GET") {
      const ghResp = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });

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

    if (method === "PUT") {
      const body = await request.text();
      try { JSON.parse(body); } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const shaResp = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });
      let sha = null;
      if (shaResp.ok) {
        const shaData = await shaResp.json();
        sha = shaData.sha;
      } else if (shaResp.status !== 404) {
        const errBody = await shaResp.text();
        return new Response(JSON.stringify({ error: "GitHub SHA error", detail: errBody }), {
          status: shaResp.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const encoded = btoa(unescape(encodeURIComponent(body)));
      const putPayload = {
        message: COMMIT_MESSAGES[filename] || `update ${filename}`,
        content: encoded,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      };

      const putResp = await fetch(apiBase, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
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
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
