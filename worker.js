// Cloudflare Worker for portbill-proxy
// Routes: GET/PUT /rotations, GET/PUT /saved-bills, GET/PUT /config

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helper: build a JSON response with CORS headers always included
function jsonResp(body, status = 200) {
    return new Response(JSON.stringify(body), {
          status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

async function sha256hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

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

      // Handle CORS preflight — always return CORS headers
      if (method === "OPTIONS") {
              return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const filename = PATH_TO_FILE[path];
          if (!filename) {
                  return jsonResp({ error: "Not found" }, 404);
          }

      if (!TOKEN) {
              return jsonResp({ error: "GitHub token not configured" }, 503);
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
                      return jsonResp({ error: "GitHub error", detail: body }, ghResp.status);
            }

            const data = await ghResp.json();
              const content = atob(data.content.replace(/\n/g, ""));
              return new Response(content, {
                        status: 200,
                        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
              });
      }

      if (method === "PUT") {
              // Optional write-token hardening: if WRITE_TOKEN_HASH is set,
            // verify the Bearer token. If not set, writes are open (personal use).
            const tokenHash = env.WRITE_TOKEN_HASH;
              if (tokenHash) {
                        const authHeader = request.headers.get("Authorization") || "";
                        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
                        const submittedHash = token ? await sha256hex(token) : "";
                        if (submittedHash !== tokenHash) {
                                    return jsonResp({ error: "Unauthorized" }, 401);
                        }
              }

            const body = await request.text();
              try { JSON.parse(body); } catch {
                        return jsonResp({ error: "Invalid JSON body" }, 400);
              }

            // Get current SHA for update
            const shaResp = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });
              let sha = null;
              if (shaResp.ok) {
                        const shaData = await shaResp.json();
                        sha = shaData.sha;
              } else if (shaResp.status !== 404) {
                        const errBody = await shaResp.text();
                        return jsonResp({ error: "GitHub SHA error", detail: errBody }, shaResp.status);
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
                      return jsonResp({ error: "GitHub write error", detail: errBody }, putResp.status);
            }

            const putData = await putResp.json();
              return jsonResp({
                        ok: true,
                        sha: putData.content?.sha,
                        commit: putData.commit?.sha,
              });
      }

      return jsonResp({ error: "Method not allowed" }, 405);
    },
};
