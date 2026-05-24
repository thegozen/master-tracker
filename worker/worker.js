/**
 * Master Tracker — save proxy (Cloudflare Worker)
 *
 * Holds the GitHub token server-side so no device ever needs it. The tracker
 * page POSTs the new data.json plus an edit password; this Worker checks the
 * password and commits to GitHub on your behalf.
 *
 * Secrets (set in the Cloudflare dashboard or via `wrangler secret put`,
 * NEVER hard-coded here — this file is committed to a public repo):
 *   GITHUB_TOKEN  — fine-grained PAT, "Contents: Read and write" on the repo
 *   EDIT_PASSWORD — the password the tracker must send to authorize a save
 *
 * Request body (JSON):
 *   { password, data }        → commit `data` as data.json
 *   { password, test: true }  → verify password + GitHub access, no commit
 */

const REPO_OWNER = 'thegozen';
const REPO_NAME = 'master-tracker';
const BRANCH = 'main';
const FILE_PATH = 'data.json';
const COMMIT_MESSAGE = 'Update tracker data';

// Which sites may call this Worker. The password is the real auth gate (it is
// sent in the body, not as a cookie, so other sites can't forge it), so '*' is
// safe here. To lock it down, replace with e.g. ['https://thegozen.github.io'].
const ALLOWED_ORIGINS = ['*'];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return json(request, { error: 'Method not allowed' }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(request, { error: 'Invalid JSON body' }, 400);
    }

    const { password, data, test } = payload || {};

    if (!password || password !== env.EDIT_PASSWORD) {
      return json(request, { error: 'Wrong edit password' }, 401);
    }

    const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'master-tracker-worker',
    };

    // Read current file to get its SHA (and, for a test, to confirm token access).
    let sha = null;
    const getRes = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
    } else if (getRes.status !== 404) {
      const detail = await getRes.text();
      return json(request, { error: `GitHub read failed: ${getRes.status}`, detail }, 502);
    }

    if (test) {
      return json(request, { ok: true, message: 'Password OK, GitHub access OK' });
    }

    if (typeof data === 'undefined') {
      return json(request, { error: 'Missing data' }, 400);
    }

    const body = {
      message: COMMIT_MESSAGE,
      content: toBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const detail = await putRes.text();
      return json(request, { error: `GitHub save failed: ${putRes.status}`, detail }, 502);
    }

    const result = await putRes.json();
    return json(request, {
      ok: true,
      commit: result.commit && result.commit.sha,
      sha: result.content && result.content.sha,
    });
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const allow = ALLOWED_ORIGINS.includes('*')
    ? origin
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function toBase64(str) {
  // UTF-8 safe base64 (btoa alone only handles latin1).
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
