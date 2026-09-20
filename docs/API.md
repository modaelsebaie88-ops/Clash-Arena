# API reference

All endpoints are under `/api`. Authentication is a signed session cookie
(`clash_session`), set by login and registration.

**Envelope.** Success returns `{ "data": ... }`. Failure returns
`{ "error": { "code", "message", "details" } }` where `details` carries
per-field messages for validation failures.

| Code | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Not signed in |
| `FORBIDDEN` | 403 | Signed in, not allowed (also cross-origin writes) |
| `NOT_FOUND` | 404 | No such record, or not visible to you |
| `CONFLICT` | 409 | Duplicate, e.g. answering twice |
| `INVALID_STATE` | 409 | Illegal state transition, or a closed question |
| `PAYLOAD_TOO_LARGE` | 413 | Upload over the size limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Not an allowed image type |
| `VALIDATION_FAILED` | 422 | Zod validation, see `details` |
| `RATE_LIMITED` | 429 | Too many requests |

Mutating requests must carry an `Origin` header matching `APP_URL` or the
request host.

---

## Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | — | Always creates a `PARTICIPANT`. Sets the session cookie. Rate limited. |
| `POST` | `/auth/login` | — | Accepts email **or** username. Sets the session cookie. |
| `POST` | `/auth/logout` | user | Clears the cookie. |
| `GET` | `/auth/me` | — | `{ user, unreadNotifications }`; `user` is `null` when signed out. |

```jsonc
// POST /api/auth/register
{ "email": "you@example.com", "username": "ahmed", "displayName": "Ahmed", "password": "Player123!" }
```

## Tournaments

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/tournaments` | optional | `?scope=hosted` (host only), `?status=LIVE,WAITING`, `?search=`, `?limit=&offset=`. Drafts are never in the public list. |
| `POST` | `/tournaments` | host | Creates a draft and allocates a `PLAY-XXXX` code. |
| `GET` | `/tournaments/:id` | optional | Accepts an id **or** a code. Includes the scoring config, which is public on purpose. |
| `PUT` | `/tournaments/:id` | owner | Refused while `LIVE`/`PAUSED`/`ARCHIVED`. |
| `DELETE` | `/tournaments/:id` | owner | Refused while running. Cascades. |
| `POST` | `/tournaments/:id/publish` | owner | `DRAFT → REGISTRATION_OPEN`. Requires ≥ 1 question. |
| `DELETE` | `/tournaments/:id/publish` | owner | Back to `DRAFT`. |
| `POST` | `/tournaments/:id/waiting-room` | owner | `REGISTRATION_OPEN → WAITING`, notifies players. |
| `GET` | `/tournaments/:id/waiting-room` | viewer | Lobby roster (public fields only) + live state. |
| `POST` | `/tournaments/:id/join` | user | Join a tournament you can already see. |
| `POST` | `/tournaments/join` | user | Join by code alone: `{ "code": "PLAY-7X92" }`. |
| `GET` | `/tournaments/:id/state` | optional | Authoritative live snapshot; call after a reconnect. |
| `POST` | `/tournaments/:id/start` | owner | `→ LIVE` and opens question 1. |
| `POST` | `/tournaments/:id/close-question` | owner | Closes the open round without advancing: scores publish, the board moves, players land on their recap. |
| `POST` | `/tournaments/:id/next-question` | owner | Opens the next round (closing the current one first if it is still open). Ends the tournament if none are left. |
| `POST` | `/tournaments/:id/pause` | owner | Freezes the clock. |
| `POST` | `/tournaments/:id/resume` | owner | Restores the remaining time exactly. |
| `POST` | `/tournaments/:id/end` | owner | Closes everything, computes final ranks, awards badges. |
| `POST` | `/tournaments/:id/archive` | owner | `FINISHED → ARCHIVED`. |
| `GET` | `/tournaments/:id/leaderboard` | optional | `?limit=&offset=`. The caller's own row is always included. |
| `GET` | `/tournaments/:id/results` | viewer | Podium, standings, and the caller's personal summary. |
| `GET` | `/tournaments/:id/analytics` | owner | Difficulty, distributions, rank progression, highlights. |
| `GET` | `/tournaments/:id/export` | owner | CSV download (UTF-8 BOM). |
| `GET` | `/tournaments/:id/events` | owner | Audit log. |

## Questions

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/tournaments/:id/questions` | viewer | Host gets the full question including the answer key. **Everyone else gets metadata only.** |
| `POST` | `/tournaments/:id/questions` | owner | Body is a discriminated union on `type`. |
| `POST` | `/tournaments/:id/questions/reorder` | owner | `{ "orderedIds": [...] }`, must list every question once. |
| `GET` | `/questions/:id` | owner | Full question. |
| `PUT` | `/questions/:id` | owner | Only while `UPCOMING`. |
| `DELETE` | `/questions/:id` | owner | Only while `UPCOMING`; remaining orders close up. |
| `GET` | `/questions/:id/submissions` | owner | Every answer for one question. |

```jsonc
// MCQ
{ "type": "MCQ", "prompt": "Capital of Egypt?", "timeLimitSeconds": 30,
  "basePoints": 100, "speedBonusPoints": 50, "explanation": "Cairo.",
  "options": [ { "text": "Cairo", "isCorrect": true }, { "text": "Giza", "isCorrect": false } ] }

// TRUE_FALSE      → "correctValue": true
// SHORT_ANSWER    → "acceptedAnswers": ["gpu", "graphics processing unit"], "caseSensitive": false
// NUMERIC         → "correctNumber": 144, "tolerance": 0
// IMAGE_SUBMISSION→ "instructions": "Show every step."
```

## Submissions

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/questions/:id/submit` | participant | The only way to answer. |
| `GET` | `/tournaments/:id/my-submissions` | user | Your own answers; grading detail appears only once a question closes. |
| `GET` | `/tournaments/:id/submissions/pending` | owner | Photo answers waiting to be graded. |
| `POST` | `/submissions/:id/grade` | owner | `{ "outcome": "CORRECT"\|"PARTIAL"\|"INCORRECT", "points"?: 150, "feedback"?: "..." }` |

```jsonc
// POST /api/questions/:id/submit  — one of:
{ "type": "MCQ", "optionId": "..." }
{ "type": "TRUE_FALSE", "optionId": "..." }
{ "type": "SHORT_ANSWER", "text": "graphics processing unit" }
{ "type": "NUMERIC", "value": 144 }
{ "type": "IMAGE_SUBMISSION", "fileId": "..." }

// 201 response — deliberately says nothing about correctness or points:
{ "data": { "submissionId": "...", "submittedAt": "...", "responseTimeMs": 3120, "awaitingReview": false } }
```

Refusals: `403` if you never joined, are pending approval, or are disqualified;
`409` if you already answered, the question is closed, or the deadline passed;
`400` if the answer type does not match the question type.

## Participants

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/tournaments/:id/participants` | owner | Includes emails. Players never see this. |
| `PATCH` | `/tournaments/:id/participants/:participantId` | owner | `{ "action": "APPROVE" \| "DISQUALIFY" \| "REINSTATE" \| "ADJUST_SCORE" }` |

Score adjustments are recorded in the `Score` ledger and the audit log, then the
participant's aggregates are recomputed from source rows.

## Files

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/uploads` | user | `multipart/form-data`: `file`, `purpose`, optional `tournamentId` / `questionId`. PNG, JPEG, WebP, HEIC/HEIF. |
| `GET` | `/files/:id` | uploader, admin, or host | Streams the image. Anyone else gets `404`, so ids cannot be probed. |

## Users and notifications

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/users/me` | user | Profile, lifetime stats, badges, recent tournaments. |
| `PUT` | `/users/me` | user | Display name, username, bio, avatar. |
| `PUT` | `/users/me/password` | user | Requires the current password. |
| `GET` | `/users/me/history` | user | Every tournament played. |
| `GET` | `/notifications` | user | `?unread=true`, `?limit=`. |
| `PATCH` | `/notifications` | user | `{ "ids": [...] }`, or `{}` to mark all read. |
| `GET` | `/admin/overview` | host | Totals for the host console. |

---

## Websocket

Path `/api/socket`. The handshake authenticates with the same session cookie; an
unauthenticated socket is refused.

**Client → server**

| Event | Payload | Notes |
|---|---|---|
| `tournament:subscribe` | `{ tournamentId }` | Acks `{ ok, state? , error? }`. Requires host or participant. |
| `tournament:unsubscribe` | `{ tournamentId }` | |
| `time:sync` | ack with `serverNow` | Used to measure the clock offset. |

**Server → client**

| Event | When |
|---|---|
| `tournament:state` | Full snapshot |
| `tournament:joined` / `tournament:participantUpdated` | Lobby changes |
| `tournament:started` / `tournament:paused` / `tournament:resumed` / `tournament:ended` | Lifecycle |
| `question:started` | A question opens (sanitised payload, absolute deadline) |
| `question:submissionAck` | Private: your answer was stored |
| `question:submitted` / `question:stats` | Host room only: live counters |
| `question:ended` | Close: reveal, stats, leaderboard |
| `question:result` | Private: your outcome, points, rank movement, badges |
| `leaderboard:updated` | Standings changed |
| `badge:earned` / `notification:new` | Private |
| `presence:update` | Connected counts |
| `server:error` | e.g. you were disqualified |

Rooms: `tournament:{id}` (everyone), `tournament:{id}:host` (host only, live
stats), `user:{userId}` (private results and notifications).
