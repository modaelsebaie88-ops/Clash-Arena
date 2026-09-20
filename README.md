# Clash Arena

A real-time competitive tournament platform. A host builds a question set, players
join with a code, everyone sees the same question at the same moment, and the
leaderboard moves the instant a question closes.

The product is built around one loop:

```
QUESTION -> THINK -> ANSWER FAST -> RESULT -> POINTS -> RANK MOVEMENT -> LEADERBOARD -> "can I climb?"
```

---

## Quick start

Requirements: Node 20+, Docker (or your own PostgreSQL 14+).

```bash
git clone <this repo> && cd clash-arena
cp .env.example .env          # the defaults match docker-compose.yml
docker compose up -d          # PostgreSQL on 5432, Redis on 6379 (Redis optional)
npm install
npx prisma migrate deploy     # create the schema
npm run db:seed               # demo host, 10 players, 2 tournaments
npm run dev                   # http://localhost:3000
```

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Host | `admin@clasharena.dev` | `Admin123!` |
| Players | `ahmed@clasharena.dev` … `tarek@clasharena.dev` | `Player123!` |

Seeded tournaments: **PLAY-AI26** (open for registration, ten mixed-type
questions) and **PLAY-MATH** (draft, six algebra questions).

### Try the whole flow in two browsers

1. Sign in as the host, open **Control room → Tournaments → AI Challenge 2026 → Control**.
2. In a private window, sign in as `ahmed@clasharena.dev` and join with `PLAY-AI26`.
3. Host: *Open lobby*, then *Start tournament*. The player screen switches to
   round 01 on its own.
4. Answer and lock in. Host presses *Close round* - the player gets the verdict,
   the points count up and the board moves. Then *Start next round*.

---

## The look

The interface is a **broadcast graphics package**, not a dashboard: a near-black
stage, monumental condensed type, oversized tabular numerals, hairline rules and
exactly one acid accent (VOLT `#CCFF00`) that always means *live, go, yours*.

The full contract lives in **[DESIGN.md](DESIGN.md)** - colour roles, the three
type families and their jobs, mark specs, motion, microcopy and the do/don't
list. Read it before writing UI. Reference systems studied while building it are
in `docs/design-references/`.

Three rules carry most of the identity:

1. **The number first, the label second.** `137` over `POINTS`, never "You
   scored 137 points".
2. **One VOLT action per screen.** If VOLT is on screen, something is happening
   or something is expected of you.
3. **Mobile is the design target.** Desktop is the same system given more room.
   The bottom nav floats clear of the home indicator, answer rows are 68px, and
   the primary action is 56px+.

Correct/wrong, live/paused and rank movement never depend on colour alone - each
carries a glyph and a word as well.

---

## How it works

```
                 ┌──────────────── browser ────────────────┐
                 │  React (Next.js App Router) + Tailwind  │
                 └───────┬───────────────────────┬─────────┘
             HTTP writes │                       │ websocket push
                         ▼                       ▼
           ┌─────────────────────┐   ┌───────────────────────┐
           │  Route handlers     │   │  Socket.IO server     │
           │  (validate + authz) │   │  (rooms, presence)    │
           └──────────┬──────────┘   └───────────┬───────────┘
                      └────────────┬─────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │  Services            │  scoring · leaderboard
                        │  (all business logic)│  tournament · submission
                        └──────────┬───────────┘  badges · analytics · files
                                   ▼
                        ┌──────────────────────┐
                        │  Prisma / PostgreSQL │
                        └──────────────────────┘
```

Next.js and Socket.IO share **one Node process and one HTTP listener**
(`server.ts`). That is what lets an API route ("host started the next question")
reach straight into the websocket layer and fan an event out to every player.

**Writes go over HTTP, pushes come over the websocket.** Submitting an answer is
a `POST` so it gets real status codes, validation, rate limiting and idempotency;
the websocket is used for the things the server needs to *tell* clients.

### The round has two beats

Closing a round and starting the next are **separate host actions**, on purpose.
`close-question` publishes scores, moves the board and drops every player onto
their recap: verdict, points counting up, rank movement, streak, badges. The room
sits there until the host presses *Start next round*. Collapsing the two into one
button would skip the entire emotional payoff of the format.

### Server-authoritative timing

This is the fairness backbone.

- When a question opens the server stamps `startedAt` and `endsAt` and schedules
  its own `setTimeout` to close it. The question closes whether or not anyone is
  connected.
- Response time is `serverReceivedAt - question.startedAt`. The client never
  sends a timestamp, and nothing it sends can influence the score.
- The browser countdown renders from the absolute `endsAt` plus a measured clock
  offset (`time:sync` over the socket, halving the round trip). It is decoration:
  a player with a wrong system clock sees the right number and is judged by the
  server either way.
- Pausing shifts `startedAt` forward by the paused duration on resume, so nobody
  is charged for the seconds the host was paused.
- On boot, `reconcileLiveTournaments()` reschedules or closes any question that
  was open when the process last stopped.

### Race conditions and double scoring

- `Submission` has a unique index on `(questionId, userId)`. Duplicate answers
  are impossible at the database level, not by application check.
- A submission takes a **shared** lock on the tournament row; closing a question
  takes an **exclusive** one. A thousand players can submit concurrently, but a
  close can never interleave with a half-written submission.
- Participant aggregates (points, streak, counts) are written inside the same
  transaction as the submission, so they cannot drift from the source rows.
- Totals are clamped at zero, so a configured penalty can never produce a
  negative score.

### Nothing leaks early

- `toParticipantQuestion()` is the only shape sent to a player. It strips the
  answer key, per-option `isCorrect`, and the explanation.
- The response to `POST /api/questions/:id/submit` contains **no** correctness or
  points. Both are published to everyone at once when the question closes.
- Badges are evaluated at close time, not at submit time - awarding "First Blood"
  early would tell a player their answer was right while the clock is still running.
- The question list endpoint returns metadata only for non-hosts.

### Scoring

`src/lib/services/scoring-service.ts` is a pure function of
`(outcome, timing, question value, config)` - no storage, no transport, fully
unit-tested.

```
speedRatio  = clamp(1 - responseTime / timeLimit, 0, 1)
speedBonus  = speedBonusPoints × curve(speedRatio)
streakBonus = min(cap, pointsPerStep × consecutiveCorrectBefore)
total       = max(0, basePoints + speedBonus + streakBonus)
```

The curve is swappable (`LINEAR_SPEED_BONUS`, `STEPPED_SPEED_BONUS`, `FLAT`) and
new ones can be registered at runtime with `registerSpeedCurve()`. Every value is
editable per tournament in the host console, with a live preview of what a
correct answer is worth at several points across the clock.

Tie-breaks are an ordered, configurable list: total points → correct answers →
total response time → earliest final submission (best streak is also available).
Players tied on every key share a rank, and the next rank skips.

### Question types

`MCQ`, `TRUE_FALSE`, `SHORT_ANSWER`, `NUMERIC`, `IMAGE_SUBMISSION`. Each type
plugs a validator, an evaluator and a reveal builder into the maps in
`question-service.ts`; adding a sixth type touches that file and nothing else.

Photo answers are graded by the host from the control room (correct / partial /
incorrect, with optional explicit points and written feedback). The seam for an
AI grader is exactly there: produce a suggested outcome and confidence, leave the
final call with the host.

### Uploads

Files are written **outside `./public`** and streamed back through
`GET /api/files/:id`, which checks that the caller is the uploader, an admin, or
the host of the related tournament. Size, declared MIME type and the real magic
bytes must all agree, the filename is generated server-side, and the response
carries `nosniff` plus a sandboxing CSP.

---

## Project layout

```
server.ts                   Next.js + Socket.IO on one listener
prisma/
  schema.prisma             13 models, documented inline
  seed.ts                   demo host, players, tournaments, questions
src/
  app/
    (auth)/                 login, register
    dashboard, tournaments, join, profile, history
    tournaments/[id]/       detail · waiting-room · play · result · leaderboard
    admin/                  console, tournaments, questions, participants, live, results, analytics
    api/                    38 route handlers
  components/
    ui/                     button, card, field, dialog, misc primitives
    tournament/             countdown, question panel, leaderboard, podium, result card
    admin/                  shell, tournament form, question builder, charts
    layout/                 app shell + notification bell
  lib/
    services/               all business logic (see below)
    realtime/               event contract, presence, timer registry, io accessor
    auth/                   edge-safe tokens + server session helpers
    client/                 api client, hooks, socket
  types/                    shared DTOs
tests/                      81 unit tests
scripts/smoke-tournament.mjs  full-flow integration test against a running server
```

Services: `AuthService` (auth/session), `TournamentService`, `QuestionService`,
`SubmissionService`, `ScoringService`, `LeaderboardService`,
`NotificationService`, `BadgeService`, `FileService`, `AnalyticsService`,
`ResultsService`, `ParticipantService`, `UserService`, `EventLogService`.

No business logic lives in a React component.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with watch (Next + Socket.IO) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run setup` | install + generate + migrate + seed |
| `node scripts/generate-icons.mjs` | Rebuild the PWA / touch icons from the brand colours |
| `node scripts/visual-check.mjs <dir>` | Drive a real tournament and screenshot every screen at phone, tablet and desktop sizes |

---

## Testing

**Unit tests** cover the logic where a bug would silently corrupt a competition:

```bash
npm test
```

- `scoring.test.ts` - fast/slow/wrong/no-answer, streak caps, partial credit,
  formula swapping, config parsing, no negative totals.
- `ranking.test.ts` - ordering, every tie-break, shared ranks, rank movement,
  disqualified players sinking.
- `tournament-state.test.ts` - the full transition table, including everything
  that must be refused.
- `question-evaluation.test.ts` - per-type grading and, importantly, that the
  participant-facing question shape leaks no answer key.

**Integration** is covered by a script that drives the running server exactly as
real clients would - one host, five players, HTTP plus websockets:

```bash
npm run dev                          # in one terminal
node scripts/smoke-tournament.mjs    # in another
```

It asserts 74 things end to end, including: all five question types, websocket
delivery, that faster correct answers score higher, that a duplicate answer is
rejected, that a late answer is rejected, that an unauthenticated socket is
refused, that a non-image disguised as a PNG is rejected, that one player cannot
read another's upload, manual grading moving the leaderboard, CSV export, and
nine authorisation boundaries.

**Layout** is checked by driving a real tournament in a headless browser and
screenshotting every screen at 390x844, 375x667, 820x1180 and 1440x900:

```bash
node scripts/visual-check.mjs ./shots
```

It captures the whole journey - home, lobby, live question, selected state,
locked state, verdict, recap, rankings, podium, profile - plus the admin control
room and the question builder's phone preview. Look at the output; the script
only proves the screens render, not that they look right.

---

## Security

- bcrypt password hashing; sessions are signed JWTs (`jose`) in an httpOnly,
  SameSite=Lax cookie.
- Self-registration always creates a `PARTICIPANT`. Admin accounts are seeded or
  promoted in the database - the role can never be chosen at sign-up.
- Tournament management is scoped to the host who created it, not to "any admin".
- Every mutating route validates its body with Zod and checks the `Origin` header
  (CSRF defence on top of SameSite).
- Rate limits on login, registration, joining, submitting and uploading.
- Parameterised queries throughout (Prisma); React escapes by default; security
  headers set in `next.config.mjs`.
- Every state transition and privileged action is written to `TournamentEvent`.

---

## Scaling

The first version is correct and single-node. The seams for growth are already in
place:

- **Redis** - set `REDIS_URL` and the leaderboard cache and rate-limit counters
  move to Redis with no call-site changes (`src/lib/cache.ts`). For multi-node
  websockets, add `@socket.io/redis-adapter` in `server.ts`.
- **Leaderboards** - ranks are recomputed when a question *closes*, never per
  submission, and standings are cached. `leaderboard-service.ts` is the seam to
  swap in a Redis sorted set.
- **Indexes** - on tournament status, participant points, submissions by
  question/outcome, and events by time.
- **Rooms** - every broadcast is scoped to a tournament room; personal results go
  to a per-user room.

---

## Future modules

Architected for, deliberately not built:

- **AI question generation** - the host console posts to
  `POST /api/tournaments/:id/questions`; a generator only needs to produce that
  payload shape.
- **AI photo grading** - `evaluateAnswer()` already returns `PENDING` for photo
  answers and the grading endpoint takes an outcome plus points, so a suggested
  grade can be inserted for host confirmation.
- **AI anti-cheat** - `TournamentEvent` plus server-side response times give a
  behavioural record to analyse.
- **AI tournament insights** - `analytics-service.ts` already computes difficulty,
  response distribution and rank progression.

---

## Notes and limitations

- The UI is **dark-only** by design; it is a live-competition product, not a
  document tool. There is no light theme and no theme toggle.
- The app is installable as a PWA (standalone, portrait, dark splash). Icons are
  generated by `scripts/generate-icons.mjs` rather than committed by hand.
- Late submissions are rejected strictly at the deadline, with no grace window.
  A player whose answer leaves at 29.99s on a slow connection can lose it. Add a
  small documented grace in `submission-service.ts` if your audience needs it.
- Excel export is CSV with a UTF-8 BOM, which Excel opens correctly on a double
  click. No `.xlsx` dependency was added.
- Uploaded images are stored on local disk. For multi-node deployment, swap
  `file-service.ts` for S3-compatible object storage; the interface is already
  narrow (`saveUpload`, `readFileForViewer`).
- Drag-and-drop question reordering is implemented as up/down controls, which
  work on touch devices without a drag library.

## Production

```bash
npm ci
npx prisma migrate deploy
npm run build
NODE_ENV=production npm start
```

Set `AUTH_SECRET` to a long random value, `APP_URL` to the public origin, and put
the app behind a TLS-terminating proxy that forwards websocket upgrades. The
session cookie sets `secure` automatically when `NODE_ENV=production`.
