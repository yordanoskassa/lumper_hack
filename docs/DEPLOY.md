# Deploying the live site — Netlify (frontend) + EasyPanel (backend)

Two halves, deployed separately. Do the backend first: the frontend needs its
URL at build time.

The frontend calls the backend through `VITE_API_BASE` (see `frontend/src/api.ts`),
which is **baked in at build time** — change it, rebuild. CORS on the backend is
already open, and the SSE trace stream connects straight to the backend, so no
proxy rules are needed on Netlify.

---

## 1 · Backend on EasyPanel

The existing [`backend/Dockerfile`](../backend/Dockerfile) is what EasyPanel
builds — it listens on `$PORT` (default **8080**) on `0.0.0.0`, and boots with
or without Mongo.

1. **Projects → Create** — name it `lumper`.
2. **+ Service → App** — name it `backstop-api`.
3. **Source tab** → GitHub → repository `yordanoskassa/lumper_hack`, branch
   `main`, **Build Path `/backend`**.
4. **Build tab** → **Dockerfile** → file `Dockerfile` (relative to the build path).
5. **Environment tab** →

   ```
   GEMINI_API_KEY=your-key
   GEMINI_MODEL=gemini-3.5-flash
   LOADBOARD_ADAPTER=sandbox
   MAIL_LIVE=false
   ```

   `GOOGLE_MAPS_API_KEY` and `MONGO_URI` are optional; every key falls back to
   a labelled sandbox path, exactly like local dev.
6. **Domains tab** → use the generated `…easypanel.host` domain or attach your
   own. **HTTPS on, proxy port `8080`.**
7. **Deploy**, then open `https://YOUR-DOMAIN/api/health`.
8. **State (optional but recommended).** Without Mongo, the Memory Bank is a
   JSON snapshot on the container disk and a redeploy wipes it. Either:
   - **Mounts tab** → Volume, mount path **`/app/runtime`** (memory bank,
     outbox PDFs, quarantine survive redeploys), or
   - **+ Service → MongoDB** from the templates, copy its *internal* connection
     URL into `MONGO_URI`, redeploy.
9. Before a demo: `curl -X POST https://YOUR-DOMAIN/api/reset`.

## 2 · Frontend on Netlify

[`netlify.toml`](../netlify.toml) at the repo root already sets base
(`frontend`), build (`npm run build`), publish (`dist`), the SPA fallback, and
no-cache on the service worker.

1. **Add new site → Import an existing project → GitHub** → pick
   `yordanoskassa/lumper_hack`. Accept the settings netlify.toml provides.
2. **Site configuration → Environment variables** →

   ```
   VITE_API_BASE=https://YOUR-EASYPANEL-DOMAIN
   VITE_GOOGLE_MAPS_API_KEY=optional
   ```

   No trailing slash (a stray one is stripped anyway).
3. **Deploy.** After changing an env var, redeploy — **Deploys → Trigger
   deploy → Clear cache and deploy site** — because the value is baked into
   the bundle.

## Check it worked

- `https://YOUR-EASYPANEL-DOMAIN/api/health` → JSON, capabilities listed.
- Open the Netlify site → the connection dot goes live (that's the SSE stream,
  straight to EasyPanel).
- DevTools → Network: every `/api` call hits the EasyPanel domain, not Netlify.
- Phone: the Netlify URL is installable as the PWA — no app store.

| Symptom | Cause |
|---|---|
| Site loads, every panel empty, console CORS/404s on the Netlify domain | `VITE_API_BASE` unset at build time — set it, clear cache, redeploy |
| Live dot never connects | Backend down or wrong proxy port — health-check the EasyPanel URL |
| Board resets between visits | No volume and no Mongo — step 8 |
