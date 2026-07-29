// Cloudflare Worker for portbill-proxy
// Routes: GET/PUT /rotations, GET/PUT /saved-bills, GET/PUT /config
//         POST /track, GET /stats  (usage analytics — requires D1 binding `DB`)

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",    
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

// Shared by handleStats/handleGithubPut — verifies the Bearer token against
// WRITE_TOKEN_HASH. If the secret isn't set, writes are open (personal-use default).
async function isWriteAuthorized(request, env) {
    const tokenHash = env.WRITE_TOKEN_HASH;
    if (!tokenHash) return true;
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const submittedHash = token ? await sha256hex(token) : "";
    return submittedHash === tokenHash;
}

// ── Usage analytics (D1) ────────────────────────────────────────
// Table: visits (day TEXT, device TEXT, opens INTEGER DEFAULT 1, PRIMARY KEY (day, device))
// Day boundaries are Asia/Dhaka (UTC+6, no DST).

function dhakaDay(offsetDays = 0) {
    return new Date(Date.now() + (6 * 3600 + offsetDays * 86400) * 1000)
        .toISOString()
        .slice(0, 10);
}

// POST /track — open endpoint; one row upsert per (day, device)
async function handleTrack(request, env) {
    if (!env.DB) return jsonResp({ error: "stats not configured" }, 503);
    let id = "";
    try {
        const body = await request.json();
        id = String(body.id || "");
    } catch {
        return jsonResp({ error: "Invalid JSON body" }, 400);
    }
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
        return jsonResp({ error: "Invalid device id" }, 400);
    }
    await env.DB.prepare(
        "INSERT INTO visits (day, device) VALUES (?1, ?2) " +
        "ON CONFLICT(day, device) DO UPDATE SET opens = opens + 1"
    ).bind(dhakaDay(), id).run();
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// GET /stats — bucket totals (exact uniques via COUNT DISTINCT) + daily series.
// Guarded by the same Bearer / WRITE_TOKEN_HASH check as PUT routes.
async function handleStats(request, env, url) {
    if (!env.DB) return jsonResp({ error: "stats not configured" }, 503);
    if (!(await isWriteAuthorized(request, env))) {
        return jsonResp({ error: "Unauthorized" }, 401);
    }

    const days = Math.min(366, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const bucket =
        "SELECT COUNT(DISTINCT device) AS uniques, COALESCE(SUM(opens), 0) AS opens " +
        "FROM visits WHERE day >= ?1";
    const [today, last7, last30, allTime, series] = await env.DB.batch([
        env.DB.prepare(bucket).bind(dhakaDay()),
        env.DB.prepare(bucket).bind(dhakaDay(-6)),
        env.DB.prepare(bucket).bind(dhakaDay(-29)),
        env.DB.prepare(
            "SELECT COUNT(DISTINCT device) AS uniques, COALESCE(SUM(opens), 0) AS opens FROM visits"
        ),
        env.DB.prepare(
            "SELECT day, COUNT(*) AS uniques, SUM(opens) AS opens " +
            "FROM visits WHERE day >= ?1 GROUP BY day ORDER BY day"
        ).bind(dhakaDay(-(days - 1))),
    ]);
    return jsonResp({
        today: today.results[0],
        last7: last7.results[0],
        last30: last30.results[0],
        allTime: allTime.results[0],
        days: series.results,
    });
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

// GET a proxied file straight from GitHub Contents API.
async function handleGithubGet(apiBase, ghHeaders, branch) {
    const ghResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders });
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

// PUT a proxied file to GitHub Contents API (create-or-update via current SHA).
async function handleGithubPut(request, env, apiBase, ghHeaders, branch, filename) {
    // Optional write-token hardening: if WRITE_TOKEN_HASH is set, verify the Bearer
    // token. If not set, writes are open (personal use).
    if (!(await isWriteAuthorized(request, env))) {
        return jsonResp({ error: "Unauthorized" }, 401);
    }

    const body = await request.text();
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch {
                    return jsonResp({ error: "Invalid JSON body" }, 400);
        }

        // Get current SHA for update
        const shaResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders });
        let sha = null;
        let existingContent = null;
        if (shaResp.ok) {
                    const shaData = await shaResp.json();
                    sha = shaData.sha;
                    if (typeof shaData.content === "string") {
                                    try {
                                                        existingContent = JSON.parse(atob(shaData.content.replace(/\n/g, "")));
                                    } catch {
                                                        existingContent = null;
                                    }
                    }
        } else if (shaResp.status !== 404) {
                    const errBody = await shaResp.text();
                    return jsonResp({ error: "GitHub SHA error", detail: errBody }, shaResp.status);
        }

        // Safety net for saved-bills.json: merge with existing remote data instead of a
        // blind overwrite, so a stale/empty local client state can never silently delete
        // bills that already exist in the cloud copy.
        let finalBody = body;
        if (filename === "saved-bills.json" && Array.isArray(existingContent) && Array.isArray(parsedBody)) {
                    const merged = new Map();
                    for (const bill of existingContent) {
                                    if (bill && bill.billNumber) merged.set(bill.billNumber, bill);
                    }
                    for (const bill of parsedBody) {
                                    if (bill && bill.billNumber) merged.set(bill.billNumber, bill);
                    }
                    finalBody = JSON.stringify([...merged.values()]);
        }

        const encoded = btoa(unescape(encodeURIComponent(finalBody)));
    const putPayload = {
        message: COMMIT_MESSAGES[filename] || `update ${filename}`,
        content: encoded,
        branch,
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

// DELETE /saved-bills - explicit single-bill deletion (admin-only, via isWriteAuthorized).
// Bypasses the merge safety-net in handleGithubPut on purpose: this is a deliberate,
// authenticated delete action (not a stale/blind client overwrite), so it must be able
// to actually remove a bill from the stored array.
async function handleDeleteBill(request, env, apiBase, ghHeaders, branch) {
    if (!(await isWriteAuthorized(request, env))) {
        return jsonResp({ error: "Unauthorized" }, 401);
    }

    let billNumber = "";
    try {
        const body = await request.json();
        billNumber = String(body.billNumber || "");
    } catch {
        return jsonResp({ error: "Invalid JSON body" }, 400);
    }
    if (!billNumber) {
        return jsonResp({ error: "billNumber is required" }, 400);
    }

    const shaResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders });
    if (!shaResp.ok) {
        const errBody = await shaResp.text();
        return jsonResp({ error: "GitHub SHA error", detail: errBody }, shaResp.status);
    }
    const shaData = await shaResp.json();
    const sha = shaData.sha;

    let bills = [];
    try {
        bills = JSON.parse(atob(shaData.content.replace(/\n/g, "")));
    } catch {
        return jsonResp({ error: "Could not parse saved-bills.json" }, 500);
    }
    if (!Array.isArray(bills)) {
        return jsonResp({ error: "saved-bills.json is not an array" }, 500);
    }

    const before = bills.length;
    const filtered = bills.filter((b) => b && b.billNumber !== billNumber);
    if (filtered.length === before) {
        return jsonResp({ error: "Bill not found", billNumber }, 404);
    }

    const finalBody = JSON.stringify(filtered);
    const encoded = btoa(unescape(encodeURIComponent(finalBody)));
    const putResp = await fetch(apiBase, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
            message: `fix(saved-bills): delete bill ${billNumber}`,
            content: encoded,
            branch,
            sha,
        }),
    });
    if (!putResp.ok) {
        const errBody = await putResp.text();
        return jsonResp({ error: "GitHub write error", detail: errBody }, putResp.status);
    }

    const putData = await putResp.json();
    return jsonResp({
        ok: true,
        deleted: billNumber,
        remaining: filtered.length,
        sha: putData.content?.sha,
        commit: putData.commit?.sha,
    });
}


export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // Handle CORS preflight — always return CORS headers
        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        // Usage analytics routes (D1-backed, independent of the GitHub proxy)
        if (path === "/track" && method === "POST") {
            return handleTrack(request, env);
        }
        if (path === "/stats" && method === "GET") {
            return handleStats(request, env, url);
        }

        const filename = PATH_TO_FILE[path];
        if (!filename) {
            return jsonResp({ error: "Not found" }, 404);
        }

        const TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;
        if (!TOKEN) {
            return jsonResp({ error: "GitHub token not configured" }, 503);
        }

        const OWNER = env.REPO_OWNER || "samiulAsumel";
        const REPO = env.REPO_NAME || "portbill-data";
        const BRANCH = env.BRANCH || "main";
        const ghHeaders = {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "portbill-proxy-worker/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        };
        const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`;

        if (method === "GET") {
            return handleGithubGet(apiBase, ghHeaders, BRANCH);
        }
        if (method === "PUT") {
            return handleGithubPut(request, env, apiBase, ghHeaders, BRANCH, filename);
        }

        if (method === "DELETE" && path === "/saved-bills") {
            return handleDeleteBill(request, env, apiBase, ghHeaders, BRANCH);
        }
        

        return jsonResp({ error: "Method not allowed" }, 405);
    },
};
