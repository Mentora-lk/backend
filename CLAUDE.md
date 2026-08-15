# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Node.js/Express backend for Mentora, a tutoring platform. No ORM — all database access is raw SQL via the `pg` `Pool`. PostgreSQL is the only datastore.

## Commands

```bash
npm install       # install dependencies
npm run dev        # start with nodemon (auto-reload) — normal dev loop
npm start          # start without reload (production mode)
```

There is no test suite, lint config, or build step configured in `package.json` — don't assume `npm test` or `npm run lint` exist.

Server listens on `http://localhost:5000` by default (`PORT` env var). Health check: `GET /api/health`. There's also a live DB check at `GET /api/db-status` and a debug endpoint `GET /api/debug/check-user/:email` (see caveats below).

### Environment

Config is read directly from `process.env` in [src/config/env.js](src/config/env.js) and [src/config/db.js](src/config/db.js), loaded via `dotenv` from a `.env` file at the repo root (gitignored, not committed). Variables in use: `PORT`, `DATABASE_URL` (if set, used as the Postgres connection string with `ssl: { rejectUnauthorized: false }`, otherwise falls back to `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`), `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, `EMAIL_USER`/`EMAIL_PASS` (Gmail SMTP via nodemailer), `FRONTEND_URL`.

## Architecture

**Layering:** routes → controllers → models, plus `services/` and `utils/`. Routes wire an Express `Router` to controller functions and attach `protect`/`restrictTo`/`multer` middleware. Controllers hold request handling and business logic (validation, hashing, Cloudinary uploads, SQL orchestration) inline — there's no separate service layer being used consistently (`src/services/emailService.js` and `src/services/recommendationService.js` are mostly stubs/placeholders; real email sending goes through `src/utils/sendEmail.js`, not the service). Models under `src/models/` are a mixed bag: `userModel.js` is a real query module (functions wrapping `db.query`), while `Course.js`, `Payment.js`, `Tutor.js` are empty placeholders and `Booking.js` documents the `bookings`/enrollment table shape as a JS object rather than exporting real queries — course/enrollment/payment SQL actually lives directly inside the corresponding controllers.

**Entry point / boot sequence:** [src/server.js](src/server.js) loads env, connects to Postgres (`connectDatabase`, exits process on failure), creates a raw `http.Server` wrapping the Express `app` (so Socket.io and Express share one port), calls `initSocket(httpServer, app)`, then starts listening.

**App wiring:** [src/app.js](src/app.js) mounts routers by prefix: `/api/auth`, `/api/users`, `/api/tutors`, `/api/courses`, `/api/enrollments`, `/api/payments`, `/api/admin`, `/api/tutor` (tutor community), `/api/student` (student community). Note the file currently has duplicated blocks (two `module.exports = app`, two 404 handlers, two `/` handlers) from incremental edits — when adding routes/middleware, check where in the file it will actually take effect before the first `module.exports`.

**Auth:** JWT-based. `protect` (in [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js)) reads `Authorization: Bearer <token>`, verifies with `JWT_SECRET`, and attaches the decoded `{ id, role }` payload as `req.user`. Role gating exists in two parallel forms — `authorize(...roles)` (also in authMiddleware.js) and `restrictTo(...roles)` (in [src/middleware/roleMiddleware.js](src/middleware/roleMiddleware.js)) — both do the same thing; different route files pick one or the other, so match whichever the surrounding route file already uses. Tokens are minted with `generateToken(id, role)` in [src/utils/jwtHelper.js](src/utils/jwtHelper.js). Passwords are hashed with `bcryptjs` inline in `authController.js` (no shared helper despite `src/utils/passwordHash.js` existing — check whether it's actually used before assuming so).

**Real-time (Socket.io):** [src/socket.js](src/socket.js) attaches Socket.io to the same HTTP server and requires a valid JWT in `socket.handshake.auth.token` for every connection (`io.use` middleware sets `socket.user`). The `io` instance is exposed to Express controllers via `app.locals.io` / `req.app.locals.io` — that's how HTTP-triggered actions (e.g. a new community post) push realtime events. Community "rooms" are named `community:<communityId>`; clients join/leave via `join_community`/`leave_community` events.

**File uploads:** `multer` with `memoryStorage()` is configured per-route (not centrally), then buffers are streamed to Cloudinary via `uploadToCloudinary(buffer, folder, fileName?)` in [src/utils/cloudinaryUpload.js](src/utils/cloudinaryUpload.js), which returns a `secure_url` to store in Postgres. Different routes use different multer configs for the same kind of upload — e.g. registration uses `upload.fields([...])` with named fields, while tutor-community posts use `upload.any()` and then copy the first file onto `req.file` for compatibility. Match the existing pattern in the specific route file rather than introducing a third convention.

**Database access:** `src/config/db.js` exports `{ pool, query, connectDatabase }`. Everywhere else calls `db.query(sql, params)` directly with parameterized (`$1, $2, ...`) queries — there's no query builder or migration tool in this repo. Root-level scripts like [db-update.js](db-update.js), [schema_check.js](schema_check.js), [list-tables.js](list-tables.js), and the `check_*.js` files are ad hoc one-off scripts for inspecting/patching the live schema, not part of the app runtime — don't wire them into `src/`.

**Community feature split:** "Community" functionality is split into two independent controller/route pairs by role — `tutorCommunityController`/`tutorCommunityRoutes` (mounted at `/api/tutor`) for tutors managing communities, posts, membership requests, and deadlines, and `studentCommunityController`/`studentCommunityRoutes` (mounted at `/api/student`) for the student-facing side. They are not a shared module — check both when a change should apply to both roles.

**Direct messaging (not on `main`/`Ryan`):** There is no `/api/messages` route on this branch — the frontend's messaging pages currently have nothing to talk to. A working implementation exists unmerged on `origin/Nishitha`: `src/controllers/messageController.js` + `src/routes/messageRoutes.js`, mounted at `/api/messages` (`GET /contacts`, `GET /conversations`, `GET /:userId`, `POST /:userId`), backed by a `messages` table (`sender_id`, `recipient_id`, `content`, `is_read`, `created_at`). Its `socket.js` additionally auto-joins every connected socket to a personal room `user:<id>` on connect and emits `new_message` there from `sendMessage` — a different realtime scheme than the community `community:<id>` rooms. If DMs are needed, port this branch's messaging files rather than building from scratch; the frontend's current `messagingService.ts` (raw `WebSocket` to `/ws/conversations/:id`) matches neither this REST+Socket.io contract nor anything this backend currently serves and would need to be rewritten to match it.

## Known rough edges (real, not to "fix" silently)

- [src/app.js](src/app.js) has duplicated middleware/route blocks after multiple incremental edits (see above). Read the whole file before editing it.
- Debug/diagnostic endpoints are live in `app.js` in all environments, including one that returns password hash metadata for a user by email (`/api/debug/check-user/:email`). Treat as sensitive; don't extend this pattern.
- Several `src/models/*.js` files are empty placeholders (`Course.js`, `Payment.js`, `Tutor.js`) — don't assume a model file's existence means it's used; grep for the actual query in the relevant controller.
- `src/services/emailService.js` is a no-op stub; the code path actually used for sending mail is `src/utils/sendEmail.js` (nodemailer, Gmail).
