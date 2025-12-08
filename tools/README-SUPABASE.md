Supabase <> Loyverse sync (ShoePao)

What this folder contains
- sync-loyverse-to-supabase.js — Node script that fetches items, customers, and sales from Loyverse and upserts into Supabase via the REST API.
- .env.example — environment variables example.
- infra/supabase-schema.sql — SQL schema to create required tables in Supabase.

Quick setup
1. Create a Supabase project (https://app.supabase.com), open SQL editor and run `infra/supabase-schema.sql` to create tables.
2. In Supabase project settings -> API, get the Service Role key (server-only). Keep it secret.
3. In Loyverse, generate an API token (or create a new token if you rotated the previously exposed one).
4. Copy `.env.example` to `.env` in the repo root (or set env variables in your host) and set:
   - LOYVERSE_API_KEY
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
5. Install dependencies and run:

   npm init -y
   npm install axios dotenv
   node tools/sync-loyverse-to-supabase.js

Behavior & notes
- The script uses the Loyverse API endpoints. Confirm the exact endpoint paths and response shapes in your Loyverse API docs—adjust mapping functions in `sync-loyverse-to-supabase.js` accordingly.
- The script uses Supabase PostgREST upsert via the `on_conflict` query parameter — it will merge duplicates by primary key / unique constraint.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Do NOT expose in client JS.

Scheduling
- Run the script with a cron job on a VPS, or deploy it as a scheduled serverless function (Vercel Cron, AWS Lambda scheduled event, or GitHub Actions schedule).
- Track last sync time in a small table or a file and pass `since` to avoid reprocessing all records.

Next steps (recommended)
- Add auditing/logging and error handling to the script.
- Add incremental sync support (use updated_at or a since timestamp).
- Implement webhooks if Loyverse exposes them for real-time sync.
- Upload product images to Supabase Storage and replace image URLs in `inventory.images` with Storage paths.

Security
- Revoke any Loyverse token you accidentally published and create a new one. Use environment variables and secret managers in production.

If you want, I can:
- Tailor the script to your exact Loyverse response samples (paste one item and one sale JSON),
- Add incremental sync with last-sync storage in Supabase,
- Implement image download/upload to Supabase Storage automatically,
- Deploy as a scheduled function.
