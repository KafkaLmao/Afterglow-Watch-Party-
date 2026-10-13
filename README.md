# Afterglow

A watch-party app with shared playback, chat, reactions, polls, and host handover. Rooms start empty. Hosts paste a YouTube, Vimeo, or direct HTTPS video/audio link; there is no starter-film catalog or automatic video.

## Development

### Vercel / Next.js

`vercel.json` selects the native Next.js build (`pnpm build:vercel`), which produces `.next/routes-manifest.json`. Do not set Vercel's Output Directory to `dist`; remove any Output Directory override. Use the Next.js framework preset and the repository root as Root Directory.

Rooms on Vercel use Neon Postgres:

1. Connect a Neon database to the Vercel project through the Marketplace, or create one in Neon.
2. Set the server-only `DATABASE_URL` environment variable to its Neon connection string for the desired Vercel environments. Never use a `NEXT_PUBLIC_` prefix or commit the connection string.
3. Run the SQL in `db/postgres.sql` once in that database's SQL editor.
4. Redeploy the latest GitHub commit.

The homepage builds without database credentials. Room requests return HTTP 503 until `DATABASE_URL` is configured; they also require the SQL schema above. No in-memory room fallback is used, so rooms remain shared across serverless instances.

For local Next.js development, put `DATABASE_URL` in an ignored `.env.local`, then use `pnpm dev:vercel`. Use `pnpm build:vercel` and `pnpm start:vercel` to test the production Next.js server. The Vercel database is separate from the local Cloudflare database.

### Cloudflare / Sites local preview

Requires Node.js 22.13 or later and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Initialize the local D1 database after the first build:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wide_tomorrow_man.sql
```

Run `pnpm dev` for development, or `pnpm start -- --port 5173` to serve the built app. On Windows, stop the built server before rebuilding: it can hold generated files open.

## Checks

```sh
pnpm check          # Formatting, TypeScript, ESLint, and room-engine tests
pnpm format         # Format maintained application source
pnpm build          # Production bundle
```

With a built server running, `node tests/benchmark.mjs http://127.0.0.1:5173` checks concurrent chat and voting, late joins, retry deduplication, and host transfer. It records HTTP propagation times in `tests/benchmark-results.json`. These measurements describe localhost behavior, not internet latency or playback drift across physical devices.

## Source layout

| Location                                                   | Responsibility                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `app/page.tsx`, `app/layout.tsx`                           | Route entry point, metadata, and appearance provider        |
| `components/afterglow.tsx`                                 | Navigation and feature composition                          |
| `components/discover.tsx`, `components/artwork.tsx`        | Link-first landing page                                     |
| `components/watch-room.tsx`, `components/social-panel.tsx` | Media player, participants, chat, and polls                 |
| `components/dialog.tsx`, `components/room-dialog.tsx`      | Accessible dialog shell and room forms                      |
| `hooks/use-room.ts`                                        | Session restoration, polling, retries, and clock estimation |
| `hooks/use-playback.ts`                                    | Media synchronization against the room timeline             |
| `hooks/use-preferences.ts`                                 | Browser-local display name and saved films                  |
| `lib/room-types.ts`                                        | Shared room, session, and action contracts                  |
| `lib/room-engine.mjs`                                      | Framework-independent room state transitions                |
| `lib/room-store.ts`, `app/api/room/route.ts`               | D1 persistence, request validation, and room API            |
| `db/`, `drizzle/`                                          | Database schema and migrations                              |
| `build/`, `scripts/`                                       | Sites/Cloudflare runtime and build integration              |

The registry components in `components/ui/` and styles in `vendor/` retain their upstream conventions. Formatting focuses on maintained app source rather than rewriting those files.

## Room protocol

Rooms are stored as JSON records with a monotonic revision: in D1 for Cloudflare, or Neon Postgres for Vercel. Writes use compare-and-swap and retry up to 20 collisions. Each participant has a bearer token; public snapshots omit tokens and the retry ledger. Actions carry an ID so retries cannot repeat a mutation.

The host controls playback, source changes, poll creation, and host transfer. Participants can chat, react, share links in chat, vote, and mark themselves ready. Rooms accept 30 active participants. Heartbeats run every eight seconds; presence expires after 25 seconds. A heartbeat or action assigns an active replacement when the host is offline.

Clients poll 100 ms after the preceding response, with a one-second delay while disconnected. The fastest observed round trip estimates server clock offset. Direct media is checked every 200 ms, seeking beyond 250 ms of error and applying a small rate correction beyond 60 ms. YouTube and Vimeo use official iframe APIs, checking every 500 ms and seeking beyond 1.5 seconds of drift. Provider buffering, ads, and browser autoplay rules can delay playback. Browsers that block autoplay require a user tap.

Chat retains 100 messages; the retry ledger retains 256 action IDs. Votes replace each participant's previous vote. Room sessions survive a reload in the same tab. Display names are stored on the device.

## Hosting

`.openai/hosting.json` contains the Sites project ID and the D1 binding name, `DB`. Vite imports this file, and the build copies it into deployment output. Keep it while using the current hosting integration.

Hosting access and room membership are separate. An invite grants room membership only to someone who can access the hosted site. Configure the intended audience in Sites sharing settings.

## Limits

YouTube video links (watch, share, Shorts, live, and embed) and Vimeo links use official provider players. Direct file links support video formats such as MP4, WebM, MOV, and audio formats such as MP3, WAV, and OGG, subject to browser codec support. Private, age-restricted, region-restricted, or non-embeddable videos may fail. DRM streaming-service pages and playlists are not supported. Live content has provider-dependent seeking limits; synchronization is best suited to on-demand media. Existing rooms with an automatic catalog selection appear empty until the host adds a link.

Polling generates database traffic. Larger deployments would need a per-room coordinator and push transport. Automated room retention cleanup is not implemented. Validate latency and media drift on real devices before relying on the recorded local benchmark.
