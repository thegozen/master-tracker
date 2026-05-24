# Master Tracker — Sync Worker setup

This Cloudflare Worker lets you edit the tracker from any device (phone, laptop,
borrowed computer) without ever putting a GitHub token on that device. The token
lives only inside Cloudflare as a secret. Each device only needs the Worker URL
and an edit password.

Free tier is plenty: 100,000 requests/day, no credit card. You'll use a handful
a day.

---

## 1. Create the GitHub token (once)

1. Go to <https://github.com/settings/personal-access-tokens/new> (fine-grained).
2. **Repository access** → Only select repositories → `thegozen/master-tracker`.
3. **Permissions** → Repository permissions → **Contents: Read and write**.
4. Set an expiration (e.g. 1 year — set a reminder to rotate it) and **Generate**.
5. Copy the token (starts with `github_pat_...`). You'll paste it into Cloudflare next.

## 2. Create the Worker

1. Sign up / log in at <https://dash.cloudflare.com>.
2. Left sidebar → **Workers & Pages** → **Create** → **Create Worker**.
3. Name it `master-tracker` (this becomes part of the URL) → **Deploy**.
4. Click **Edit code**. Delete the starter code and paste the entire contents of
   [`worker.js`](./worker.js). Click **Deploy**.

## 3. Add the two secrets

In the Worker → **Settings** → **Variables and Secrets** → **Add**:

| Type   | Name            | Value                                  |
| ------ | --------------- | -------------------------------------- |
| Secret | `GITHUB_TOKEN`  | the token from step 1                  |
| Secret | `EDIT_PASSWORD` | any password you choose (e.g. a long phrase) |

Use **Encrypt / Secret** (not plaintext) for both. **Save and deploy.**

## 4. Point the tracker at the Worker

Your Worker URL looks like `https://master-tracker.<your-subdomain>.workers.dev`
(shown at the top of the Worker page).

On **each device** you want to edit from:

1. Open the tracker → **Settings**.
2. Paste the Worker URL into **Sync Worker URL**.
3. Type your **Edit Password** (the `EDIT_PASSWORD` from step 3).
4. **Test** → should say "password accepted, GitHub access OK" → **Save**.

That's it. Now editing works on that device, and you can clear/ignore the
"Advanced: GitHub Token" field everywhere — the token only lives in Cloudflare.

---

## How it works / notes

- The page POSTs `{ password, data }` to the Worker. The Worker checks the
  password, then commits `data.json` to GitHub with its server-side token.
- `worker.js` is safe to keep in this public repo: it contains **no** secrets,
  only references to `env.GITHUB_TOKEN` / `env.EDIT_PASSWORD`.
- The edit password is the auth gate, so CORS is left open (`ALLOWED_ORIGINS =
  ['*']`). To lock the Worker to your site only, set it to
  `['https://thegozen.github.io']` in `worker.js` and redeploy.
- **Rotating access:** change `EDIT_PASSWORD` in Cloudflare to instantly cut off
  every device; regenerate the GitHub token and update `GITHUB_TOKEN` to rotate
  the GitHub side. No code changes needed.

### Optional: deploy from the CLI instead of the dashboard

```bash
npm i -g wrangler
cd worker
wrangler deploy worker.js --name master-tracker
wrangler secret put GITHUB_TOKEN     # paste token when prompted
wrangler secret put EDIT_PASSWORD    # type password when prompted
```
