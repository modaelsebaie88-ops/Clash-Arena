/**
 * End-to-end smoke test for a whole tournament.
 *
 *   node scripts/smoke-tournament.mjs [baseUrl]
 *
 * Drives the running server exactly as real clients would: one host and five
 * players, over HTTP for writes and websockets for the live events. It asserts
 * the competitive rules that matter - server-side timing, one answer per
 * player, no answer leakage, correct ranking - and prints a pass/fail report.
 *
 * Requires the server to be running (`npm run dev` or `npm start`) and the
 * database to be migrated.
 */
import { io } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal cookie-jar HTTP client, one per simulated person. */
function createClient(label) {
  let cookie = '';

  async function request(method, path, body, isForm = false) {
    const headers = { Origin: BASE };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: 'manual',
    });

    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const [pair] = entry.split(';');
      if (pair.startsWith('clash_session=')) cookie = pair;
    }

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    return { status: response.status, body: payload, headers: response.headers };
  }

  return {
    label,
    get cookie() {
      return cookie;
    },
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    upload: (path, form) => request('POST', path, form, true),
  };
}

/** Socket client that records every event it receives, for later assertions. */
function connectSocket(client) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      path: '/api/socket',
      transports: ['websocket'],
      extraHeaders: { Cookie: client.cookie },
      reconnection: false,
    });

    const events = [];
    const record = (name) => (payload) => events.push({ name, payload, at: Date.now() });

    for (const name of [
      'tournament:started',
      'question:started',
      'question:ended',
      'question:result',
      'question:submissionAck',
      'leaderboard:updated',
      'tournament:ended',
      'badge:earned',
      'presence:update',
      'notification:new',
    ]) {
      socket.on(name, record(name));
    }

    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket connect timeout')), 8000);
  });
}

const waitFor = async (events, name, timeoutMs = 12_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = events.find((event) => event.name === name);
    if (found) return found;
    await sleep(120);
  }
  return null;
};

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  console.log(`Clash Arena smoke test against ${BASE}\n`);

  // -----------------------------------------------------------------------
  section('1. Host signs in and builds a tournament');

  const host = createClient('host');
  const login = await host.post('/api/auth/login', {
    email: 'admin@clasharena.dev',
    password: 'Admin123!',
  });
  check('host can sign in', login.status === 200, `status ${login.status}`);
  check('host has the ADMIN role', login.body?.data?.user?.role === 'ADMIN');

  const created = await host.post('/api/tournaments', {
    name: `Smoke Test ${new Date().toISOString().slice(11, 19)}`,
    description: 'Automated end-to-end verification.',
    maxParticipants: 50,
    defaultTimeLimitSeconds: 6,
    defaultBasePoints: 100,
    joinByCodeEnabled: true,
    requireApproval: false,
    allowLateJoin: true,
    showLeaderboardAfterQuestion: true,
    showAnswersToParticipants: true,
    scoringConfig: {
      formula: 'LINEAR_SPEED_BONUS',
      correctPoints: 100,
      speedBonusEnabled: true,
      speedBonusPoints: 50,
      wrongAnswerPoints: 0,
      noAnswerPoints: 0,
      partialCreditEnabled: true,
      streakBonusEnabled: true,
      streakBonusPoints: 10,
      streakBonusCap: 50,
      minimumSpeedRatio: 0,
    },
    tieBreakers: ['TOTAL_POINTS', 'CORRECT_COUNT', 'TOTAL_RESPONSE_TIME'],
  });

  check('tournament is created', created.status === 201, JSON.stringify(created.body));
  const tournament = created.body?.data?.tournament;
  const tournamentId = tournament?.id;
  check('tournament gets a join code', /^PLAY-[A-Z0-9]{4}$/.test(tournament?.code ?? ''), tournament?.code);

  const questionPayloads = [
    {
      type: 'MCQ',
      prompt: 'What is the capital of Egypt?',
      explanation: 'Cairo.',
      timeLimitSeconds: 6,
      basePoints: 100,
      speedBonusPoints: 50,
      options: [
        { text: 'Alexandria', isCorrect: false },
        { text: 'Cairo', isCorrect: true },
        { text: 'Giza', isCorrect: false },
        { text: 'Luxor', isCorrect: false },
      ],
    },
    {
      type: 'TRUE_FALSE',
      prompt: 'The server, not the browser, decides whether an answer was in time.',
      timeLimitSeconds: 6,
      basePoints: 100,
      speedBonusPoints: 50,
      correctValue: true,
    },
    {
      type: 'SHORT_ANSWER',
      prompt: 'What does GPU stand for?',
      timeLimitSeconds: 6,
      basePoints: 100,
      speedBonusPoints: 50,
      acceptedAnswers: ['graphics processing unit'],
      caseSensitive: false,
    },
    {
      type: 'NUMERIC',
      prompt: 'What is 12 x 12?',
      timeLimitSeconds: 6,
      basePoints: 100,
      speedBonusPoints: 50,
      correctNumber: 144,
      tolerance: 0,
    },
    {
      type: 'IMAGE_SUBMISSION',
      prompt: 'Photograph your working for 2x + 5 = 17.',
      timeLimitSeconds: 8,
      basePoints: 150,
      speedBonusPoints: 0,
      instructions: 'Show every step.',
    },
  ];

  const questionIds = [];
  for (const payload of questionPayloads) {
    const result = await host.post(`/api/tournaments/${tournamentId}/questions`, payload);
    if (result.status !== 201) {
      console.log('    question creation failed:', JSON.stringify(result.body));
    }
    questionIds.push(result.body?.data?.question?.id);
  }
  check('all five question types are accepted', questionIds.every(Boolean));

  const reordered = await host.post(`/api/tournaments/${tournamentId}/questions/reorder`, {
    orderedIds: [questionIds[1], questionIds[0], ...questionIds.slice(2)],
  });
  check('questions can be reordered', reordered.status === 200);
  // Put them back so later assertions use the original order.
  await host.post(`/api/tournaments/${tournamentId}/questions/reorder`, { orderedIds: questionIds });

  const published = await host.post(`/api/tournaments/${tournamentId}/publish`);
  check('tournament can be published', published.status === 200, JSON.stringify(published.body));

  // -----------------------------------------------------------------------
  section('2. Players register and join with the code');

  const stamp = Date.now().toString(36);
  const playerNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
  const players = [];

  for (const name of playerNames) {
    const client = createClient(name);
    const registration = await client.post('/api/auth/register', {
      email: `${name}.${stamp}@smoke.test`,
      username: `${name}${stamp}`,
      displayName: name[0].toUpperCase() + name.slice(1),
      password: 'Player123!',
    });
    if (registration.status !== 201) {
      console.log(`    registration failed for ${name}:`, JSON.stringify(registration.body));
    }
    players.push({ name, client, userId: registration.body?.data?.user?.id });
  }
  check('five players register', players.every((player) => player.userId));
  check(
    'self-registration cannot grant the admin role',
    players.every((player) => player.userId) &&
      (await players[0].client.get('/api/auth/me')).body?.data?.user?.role === 'PARTICIPANT',
  );

  for (const player of players) {
    const joined = await player.client.post('/api/tournaments/join', { code: tournament.code });
    player.joined = joined.status === 200;
  }
  check('every player joins with the code', players.every((player) => player.joined));

  const roster = await host.get(`/api/tournaments/${tournamentId}/participants`);
  check(
    'host sees all five players in the roster',
    roster.body?.data?.participants?.length === 5,
    `saw ${roster.body?.data?.participants?.length}`,
  );

  // -----------------------------------------------------------------------
  section('3. Live connections');

  for (const player of players) {
    const connection = await connectSocket(player.client);
    player.socket = connection.socket;
    player.events = connection.events;
    await new Promise((resolve) => {
      player.socket.emit('tournament:subscribe', { tournamentId }, resolve);
    });
  }
  const hostConnection = await connectSocket(host);
  await new Promise((resolve) => {
    hostConnection.socket.emit('tournament:subscribe', { tournamentId }, resolve);
  });
  check('all six websocket clients connect and subscribe', players.every((player) => player.socket.connected));

  const anonymous = io(BASE, { path: '/api/socket', transports: ['websocket'], reconnection: false });
  const anonymousRejected = await new Promise((resolve) => {
    anonymous.on('connect', () => resolve(false));
    anonymous.on('connect_error', () => resolve(true));
    setTimeout(() => resolve(false), 4000);
  });
  anonymous.close();
  check('an unauthenticated socket is rejected', anonymousRejected);

  // -----------------------------------------------------------------------
  section('4. Question 1 - speed decides the order');

  const started = await host.post(`/api/tournaments/${tournamentId}/start`);
  check('host can start the tournament', started.status === 200, JSON.stringify(started.body));

  const q1Event = await waitFor(players[0].events, 'question:started');
  check('players receive question 1 over the websocket', Boolean(q1Event));

  const q1 = q1Event?.payload?.question;
  check('question payload hides the answer key', q1 && !('answerKey' in q1));
  check(
    'question options never carry isCorrect',
    Boolean(q1) && q1.options.every((option) => !('isCorrect' in option)),
  );
  check('question carries an absolute server deadline', Boolean(q1?.endsAt && q1?.startedAt));

  const correctOption = (questionId, text) =>
    host
      .get(`/api/questions/${questionId}`)
      .then((result) => result.body?.data?.question?.options?.find((option) => option.isCorrect)?.id);

  const q1CorrectId = await correctOption(questionIds[0]);
  const q1WrongId = q1.options.find((option) => option.id !== q1CorrectId)?.id;

  // Alpha answers immediately, Bravo after a beat, Charlie later, Delta wrong,
  // Echo never answers.
  const alphaSubmit = await players[0].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1CorrectId,
  });
  check('a fast correct answer is accepted', alphaSubmit.status === 201, JSON.stringify(alphaSubmit.body));
  check(
    'the submit response never reveals correctness or points',
    alphaSubmit.body?.data &&
      !('isCorrect' in alphaSubmit.body.data) &&
      !('awardedPoints' in alphaSubmit.body.data),
  );

  const duplicate = await players[0].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1WrongId,
  });
  check('a second answer from the same player is rejected', duplicate.status === 409, `status ${duplicate.status}`);

  await sleep(1200);
  await players[1].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1CorrectId,
  });

  await sleep(1500);
  await players[2].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1CorrectId,
  });
  await players[3].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1WrongId,
  });

  // A signed-in account that never joined THIS tournament (seeded player).
  const stranger = createClient('stranger');
  const strangerLogin = await stranger.post('/api/auth/login', {
    email: 'tarek@clasharena.dev',
    password: 'Player123!',
  });
  check('the outsider account signs in', strangerLogin.status === 200, JSON.stringify(strangerLogin.body));
  const strangerSubmit = await stranger.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1CorrectId,
  });
  check(
    'someone who never joined cannot submit',
    strangerSubmit.status === 403,
    `status ${strangerSubmit.status}`,
  );

  const playerQuestions = await players[0].client.get(`/api/tournaments/${tournamentId}/questions`);
  const leaked = JSON.stringify(playerQuestions.body).toLowerCase();
  check(
    'the question list API leaks no answer key to players',
    !leaked.includes('iscorrect') && !leaked.includes('answerkey') && !leaked.includes('cairo'),
  );

  // Let the server-side timer close the question on its own.
  const q1Ended = await waitFor(players[0].events, 'question:ended', 15_000);
  check('the server closes the question when time expires', Boolean(q1Ended));

  const lateSubmit = await players[4].client.post(`/api/questions/${questionIds[0]}/submit`, {
    type: 'MCQ',
    optionId: q1CorrectId,
  });
  check('an answer after the deadline is rejected', lateSubmit.status === 409, `status ${lateSubmit.status}`);

  const alphaResult = await waitFor(players[0].events, 'question:result');
  const bravoResult = await waitFor(players[1].events, 'question:result');
  const charlieResult = await waitFor(players[2].events, 'question:result');
  const deltaResult = await waitFor(players[3].events, 'question:result');
  const echoResult = await waitFor(players[4].events, 'question:result');

  check('every player receives a personal result', [alphaResult, bravoResult, charlieResult, deltaResult, echoResult].every(Boolean));
  check('a wrong answer scores zero', deltaResult?.payload?.awardedPoints === 0);
  check('no answer scores zero', echoResult?.payload?.awardedPoints === 0 && echoResult?.payload?.outcome === 'NO_ANSWER');
  check(
    'faster correct answers score higher',
    alphaResult?.payload?.awardedPoints > bravoResult?.payload?.awardedPoints &&
      bravoResult?.payload?.awardedPoints > charlieResult?.payload?.awardedPoints,
    `${alphaResult?.payload?.awardedPoints} / ${bravoResult?.payload?.awardedPoints} / ${charlieResult?.payload?.awardedPoints}`,
  );
  check(
    'the correct answer is revealed only after the question closes',
    alphaResult?.payload?.reveal?.correctAnswerText === 'Cairo',
  );
  check('first blood is awarded to the fastest correct answer',
    (alphaResult?.payload?.badges ?? []).some((badge) => badge.code === 'FIRST_BLOOD'));

  const boardAfterQ1 = await host.get(`/api/tournaments/${tournamentId}/leaderboard`);
  const standings = boardAfterQ1.body?.data?.entries ?? [];
  check('the leaderboard ranks the fastest player first', standings[0]?.userId === players[0].userId);
  check('ranks are dense and start at 1', standings[0]?.rank === 1);

  // -----------------------------------------------------------------------
  section('5. Remaining questions, including a photo answer');

  // Question 2 - true/false
  await host.post(`/api/tournaments/${tournamentId}/next-question`);
  const q2Event = await waitFor(players[0].events.filter((e) => e.at > (q1Ended?.at ?? 0)), 'question:started');
  const q2 = q2Event?.payload?.question;
  check('question 2 reaches the players', Boolean(q2));

  const q2TrueOption = q2?.options.find((option) => option.text === 'True')?.id;
  for (const player of players.slice(0, 3)) {
    await player.client.post(`/api/questions/${q2?.id}/submit`, {
      type: 'TRUE_FALSE',
      optionId: q2TrueOption,
    });
  }

  // Question 3 - short answer, with a deliberate near-miss on casing/spacing.
  await host.post(`/api/tournaments/${tournamentId}/next-question`);
  await sleep(400);
  const q3 = questionIds[2];
  const shortAnswers = await Promise.all([
    players[0].client.post(`/api/questions/${q3}/submit`, {
      type: 'SHORT_ANSWER',
      text: '  Graphics   Processing Unit ',
    }),
    players[1].client.post(`/api/questions/${q3}/submit`, {
      type: 'SHORT_ANSWER',
      text: 'central processing unit',
    }),
  ]);
  check('short answers are accepted', shortAnswers.every((result) => result.status === 201));

  // Question 4 - numeric
  await host.post(`/api/tournaments/${tournamentId}/next-question`);
  await sleep(400);
  const q4 = questionIds[3];
  const numericResults = await Promise.all([
    players[0].client.post(`/api/questions/${q4}/submit`, { type: 'NUMERIC', value: 144 }),
    players[1].client.post(`/api/questions/${q4}/submit`, { type: 'NUMERIC', value: 143 }),
    players[2].client.post(`/api/questions/${q4}/submit`, { type: 'NUMERIC', value: 144 }),
  ]);
  check('numeric answers are accepted', numericResults.every((result) => result.status === 201));

  const wrongType = await players[3].client.post(`/api/questions/${q4}/submit`, {
    type: 'MCQ',
    optionId: 'whatever',
  });
  check(
    'an answer of the wrong type for the question is rejected',
    wrongType.status === 400,
    `status ${wrongType.status}`,
  );

  // Question 5 - photo submission
  await host.post(`/api/tournaments/${tournamentId}/next-question`);
  await sleep(400);
  const q5 = questionIds[4];

  const form = new FormData();
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'solution.png');
  form.append('purpose', 'SUBMISSION');
  form.append('questionId', q5);
  const upload = await players[0].client.upload('/api/uploads', form);
  check('a player can upload a photo of their solution', upload.status === 201, JSON.stringify(upload.body));
  const fileId = upload.body?.data?.file?.id;

  const badForm = new FormData();
  badForm.append('file', new Blob([Buffer.from('#!/bin/sh\necho hi')], { type: 'image/png' }), 'evil.png');
  const badUpload = await players[0].client.upload('/api/uploads', badForm);
  check(
    'a non-image disguised as a PNG is rejected',
    badUpload.status === 415,
    `status ${badUpload.status}`,
  );

  const imageSubmit = await players[0].client.post(`/api/questions/${q5}/submit`, {
    type: 'IMAGE_SUBMISSION',
    fileId,
  });
  check('the photo answer is recorded', imageSubmit.status === 201);
  check('the photo answer is marked for review', imageSubmit.body?.data?.awaitingReview === true);

  const otherPlayerFile = await players[1].client.get(`/api/files/${fileId}`);
  check(
    'another player cannot read someone else\'s upload',
    otherPlayerFile.status === 404,
    `status ${otherPlayerFile.status}`,
  );
  const hostFile = await host.get(`/api/files/${fileId}`);
  check('the host can review the uploaded image', hostFile.status === 200);

  // Let the photo question close on its own clock rather than advancing past
  // the last question, which would auto-finish the tournament.
  await waitFor(players[0].events.filter((event) => event.at > (q1Ended?.at ?? 0)), 'question:ended', 14_000);
  await sleep(600);

  const pending = await host.get(`/api/tournaments/${tournamentId}/submissions/pending`);
  const pendingSubmission = pending.body?.data?.submissions?.[0];
  check('the photo answer appears in the grading queue', Boolean(pendingSubmission));

  const pointsBeforeGrading = (
    await host.get(`/api/tournaments/${tournamentId}/leaderboard`)
  ).body?.data?.entries?.find((entry) => entry.userId === players[0].userId)?.totalPoints;

  const graded = await host.post(`/api/submissions/${pendingSubmission?.id}/grade`, {
    outcome: 'CORRECT',
    points: 150,
    feedback: 'Clear working, well presented.',
  });
  check('the host can grade the photo answer', graded.status === 200, JSON.stringify(graded.body));

  const pointsAfterGrading = (
    await host.get(`/api/tournaments/${tournamentId}/leaderboard`)
  ).body?.data?.entries?.find((entry) => entry.userId === players[0].userId)?.totalPoints;
  check(
    'grading moves the score by exactly the awarded points',
    pointsAfterGrading - pointsBeforeGrading === 150,
    `${pointsBeforeGrading} -> ${pointsAfterGrading}`,
  );

  // -----------------------------------------------------------------------
  section('6. Finishing and reporting');

  const ended = await host.post(`/api/tournaments/${tournamentId}/end`);
  check('the host can end the tournament', ended.status === 200, JSON.stringify(ended.body));
  check('the tournament reports as finished', ended.body?.data?.state?.status === 'FINISHED');

  const endedTwice = await host.post(`/api/tournaments/${tournamentId}/end`);
  check(
    'a finished tournament cannot be ended again',
    endedTwice.status === 409,
    `status ${endedTwice.status}`,
  );
  const restart = await host.post(`/api/tournaments/${tournamentId}/start`);
  check(
    'a finished tournament cannot be restarted',
    restart.status === 409,
    `status ${restart.status}`,
  );

  const endEvent = await waitFor(players[0].events, 'tournament:ended');
  check('players are told the tournament finished', Boolean(endEvent));

  const results = await players[0].client.get(`/api/tournaments/${tournamentId}/results`);
  check('results are available to players', results.status === 200);
  check('a podium is produced', (results.body?.data?.podium ?? []).length > 0);
  check('personal stats are included', Boolean(results.body?.data?.me?.personal));

  const winner = results.body?.data?.standings?.[0];
  check('the fastest, most accurate player wins', winner?.userId === players[0].userId, winner?.displayName);
  check('final ranks are recorded', typeof winner?.rank === 'number');

  const analytics = await host.get(`/api/tournaments/${tournamentId}/analytics`);
  check('analytics are generated', analytics.status === 200);
  check(
    'analytics cover every question',
    (analytics.body?.data?.questions ?? []).length === questionIds.length,
  );
  check(
    'rank progression has a series per tracked player',
    (analytics.body?.data?.rankProgression ?? []).length > 0,
  );

  const exportResponse = await fetch(`${BASE}/api/tournaments/${tournamentId}/export`, {
    headers: { Cookie: host.cookie },
  });
  const csv = await exportResponse.text();
  check('CSV export downloads', exportResponse.status === 200);
  check(
    'CSV has a header row and one line per player',
    csv.split('\r\n').filter(Boolean).length === 6,
    `${csv.split('\r\n').filter(Boolean).length} lines`,
  );
  check('CSV includes the email column for the host', csv.includes('Email'));

  // -----------------------------------------------------------------------
  section('7. Authorisation boundaries');

  const player = players[1].client;
  const probes = [
    ['create a tournament', await player.post('/api/tournaments', { name: 'Nope' })],
    ['start someone else\'s tournament', await player.post(`/api/tournaments/${tournamentId}/start`)],
    ['end someone else\'s tournament', await player.post(`/api/tournaments/${tournamentId}/end`)],
    ['read the participant roster', await player.get(`/api/tournaments/${tournamentId}/participants`)],
    ['read the grading queue', await player.get(`/api/tournaments/${tournamentId}/submissions/pending`)],
    ['read analytics', await player.get(`/api/tournaments/${tournamentId}/analytics`)],
    ['export results', await player.get(`/api/tournaments/${tournamentId}/export`)],
    ['add a question', await player.post(`/api/tournaments/${tournamentId}/questions`, { type: 'MCQ', prompt: 'x' })],
    ['adjust a score', await player.patch(`/api/tournaments/${tournamentId}/participants/x`, { action: 'ADJUST_SCORE', points: 9999 })],
  ];

  for (const [name, response] of probes) {
    check(`a player cannot ${name}`, response.status === 403 || response.status === 401, `status ${response.status}`);
  }

  const anonymousClient = createClient('anon');
  const anonymousState = await anonymousClient.post(`/api/tournaments/${tournamentId}/join`, {});
  check('an anonymous request cannot join', anonymousState.status === 401, `status ${anonymousState.status}`);

  const crossOrigin = await fetch(`${BASE}/api/tournaments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: host.cookie },
    body: JSON.stringify({ name: 'CSRF attempt' }),
  });
  check('a cross-origin write is blocked', crossOrigin.status === 403, `status ${crossOrigin.status}`);

  // -----------------------------------------------------------------------
  for (const p of players) p.socket.close();
  hostConnection.socket.close();

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const name of failures) console.log(`   - ${name}`);
  }
  console.log(`${'='.repeat(52)}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
