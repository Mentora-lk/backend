# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mentora backend — a Node.js/Express API for a tutoring platform (students, tutors, courses, enrollments, payments, and per-tutor "community" classrooms with posts/materials/deadlines). Plain JS (CommonJS), no build step, no ORM (raw `pg` SQL queries), no test suite currently exists.

## Commands

```bash
npm install       # install dependencies
npm run dev        # start with nodemon (auto-reload) — normal dev loop
npm start          # start once, no reload
```

There is no lint or test script configured in `package.json`. Don't invent one — verify by running the server (`npm run dev`) and hitting the relevant endpoint, or ask before adding tooling.

The server listens on `PORT` (default 5000). Health check: `GET /` and `GET /api/health`-style checks live at `GET /api/db-status` (verifies the Postgres connection).

## Configuration

Config is loaded via `dotenv` from a root `.env` (see `src/config/env.js`). Key vars: `PORT`, `DATABASE_URL` (or discrete `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`), `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`/`CLIENT_URL`, `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`. If `DATABASE_URL` is set (e.g. Neon), `src/config/db.js` connects with it (SSL, `rejectUnauthorized: false`) and ignores the discrete `DB_*` vars.

## Architecture

**Request flow:** `src/server.js` creates a raw `http.Server` wrapping the Express `app` (`src/app.js`) so that Socket.io and HTTP share one port, then calls `initSocket` (`src/socket.js`) before starting the listener. `app.js` wires up global middleware (CORS reflecting request origin, JSON/urlencoded/text body parsing, a request logger), mounts one router per resource under `/api/*`, and ends with a global error handler + 404 handler.

**Layering per resource:** `routes/*Routes.js` → `controllers/*Controller.js` → `models/*.js` (or inline `db.query` in the controller for newer modules). Models are thin — just parameterized SQL via `src/config/db.js`'s `query(text, params)` wrapper around a `pg.Pool`. There is no query builder/ORM and no migration system in this repo; schema changes are applied ad hoc against the live Postgres/Neon database (see the throwaway `check_*.js`/`schema_check.js`/`db-update.js`/`list_tables.js` scripts at the repo root and in `scratch/` — these are one-off DB inspection/migration scripts run with `node <file>.js`, not part of the app).

**Auth:** JWT-based. `src/utils/jwtHelper.js` signs `{ id, role }` with `JWT_SECRET`/`JWT_EXPIRES_IN`. `src/middleware/authMiddleware.js` exports `protect` (verifies `Authorization: Bearer <token>`, sets `req.user`) and `authorize(...roles)`. `src/middleware/roleMiddleware.js` exports a near-duplicate `restrictTo(...roles)` — different route files use one or the other, so match whichever the file you're editing already uses rather than mixing them. Passwords are hashed with `bcryptjs` (`src/utils/passwordHash.js` / inline in `authController.js`).

**Two parallel "community" features**, both under different route prefixes and controllers — don't confuse them:
- `studentCommunityRoutes.js` → `studentCommunityController.js`, mounted at `/api/student` — students discover/join tutor communities, view feed, react to posts, download materials.
- `tutorCommunityRoutes.js` → `tutorCommunityController.js`, mounted at `/api/tutor` — tutors manage their own communities, approve join requests, publish posts/materials/deadlines.

**File uploads:** `multer` with in-memory storage (no disk writes) feeding `src/utils/cloudinaryUpload.js`, which streams the buffer to Cloudinary via `streamifier`. Used for tutor registration (profile picture/banner) and community post attachments.

**Realtime:** `src/socket.js` sets up Socket.io with JWT auth on the handshake (`socket.handshake.auth.token`, verified against `JWT_SECRET`) and a room-per-community model (`community:<id>`, joined/left via `join_community`/`leave_community` events). The `io` instance is attached to `app.locals.io` so controllers can emit from HTTP request handlers.

**Email:** `src/services/emailService.js` / `src/utils/sendEmail.js` (nodemailer) — used for password-reset flow (`authController.js`: `forgotPassword`/`resetPassword`, token hashed with SHA-256 and stored on the user row with an expiry).

## Known rough edges to be aware of

- `app.js` has an unauthenticated `GET /api/debug/check-user/:email` route that leaks password-hash metadata — treat as debug-only, don't extend or rely on it.
- Verbose `console.log` request/response logging (including auth header presence and, in `loginUser`, password length/hash) is scattered through `app.js` and controllers — this is existing debug logging, not a pattern to copy into new code.
- SQL is built with parameterized queries (`$1, $2...`) throughout — some ad hoc root-level scripts interpolate table names directly into SQL strings; those scripts aren't part of the served app, but don't follow that pattern in `src/`.
