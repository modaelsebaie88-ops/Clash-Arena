/**
 * Visual verification pass: drives a real tournament and screenshots every key
 * screen at phone and desktop sizes.
 */
import { chromium, devices } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? '.';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async req(method, p, body, isForm = false) {
      const headers = { Origin: BASE };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${BASE}${p}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const entry of res.headers.getSetCookie?.() ?? []) {
        const [pair] = entry.split(';');
        if (pair.startsWith('clash_session=')) cookie = pair;
      }
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
}

async function shoot(page, name, full = true) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  console.log(`  shot ${name}`);
}

async function main() {
  // ---- set up a real live tournament -------------------------------
  const host = client();
  await host.req('POST', '/api/auth/login', {
    email: 'admin@clasharena.dev',
    password: 'Admin123!',
  });

  const created = await host.req('POST', '/api/tournaments', {
    name: 'Neon Gauntlet',
    description: 'Five rounds. No second chances.',
    maxParticipants: 50,
    defaultTimeLimitSeconds: 45,
    defaultBasePoints: 100,
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
  const tournament = created.body.data.tournament;
  console.log('tournament', tournament.code, tournament.id);

  const qs = [
    {
      type: 'MCQ',
      prompt: 'Which city has been the capital of Egypt since 1168?',
      timeLimitSeconds: 45,
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
      type: 'IMAGE_SUBMISSION',
      prompt: 'Solve 2x + 5 = 17 and photograph your full working.',
      timeLimitSeconds: 120,
      basePoints: 150,
      speedBonusPoints: 0,
      instructions: 'Show every step.',
    },
  ];
  for (const q of qs) await host.req('POST', `/api/tournaments/${tournament.id}/questions`, q);
  await host.req('POST', `/api/tournaments/${tournament.id}/publish`);

  // Fill the lobby so the waiting room and board look real.
  const players = ['ahmed', 'mahmoud', 'omar', 'youssef', 'karim', 'lina', 'sara'];
  const sessions = [];
  for (const name of players) {
    const c = client();
    await c.req('POST', '/api/auth/login', {
      email: `${name}@clasharena.dev`,
      password: 'Player123!',
    });
    await c.req('POST', '/api/tournaments/join', { code: tournament.code });
    sessions.push({ name, c });
  }
  await host.req('POST', `/api/tournaments/${tournament.id}/waiting-room`);

  const browser = await chromium.launch();

  // ================= PHONE =================
  const phone = await browser.newContext({
    ...devices['iPhone 14'],
    baseURL: BASE,
  });
  const me = sessions[0].c;
  await phone.addCookies([
    {
      name: 'clash_session',
      value: me.cookie.split('=').slice(1).join('='),
      domain: 'localhost',
      path: '/',
    },
  ]);
  const p = await phone.newPage();

  console.log('phone pass');
  await p.goto('/dashboard', { waitUntil: 'networkidle' });
  await sleep(900);
  await shoot(p, '01-home');

  await p.goto('/tournaments', { waitUntil: 'networkidle' });
  await sleep(700);
  await shoot(p, '02-battles');

  await p.goto('/join', { waitUntil: 'networkidle' });
  await sleep(500);
  await shoot(p, '03-join');

  await p.goto(`/tournaments/${tournament.id}`, { waitUntil: 'networkidle' });
  await sleep(700);
  await shoot(p, '04-brief');

  await p.goto(`/tournaments/${tournament.id}/waiting-room`, { waitUntil: 'networkidle' });
  await sleep(1400);
  await shoot(p, '05-lobby');

  // ---- go live ----
  await host.req('POST', `/api/tournaments/${tournament.id}/start`);
  await sleep(1600);
  await shoot(p, '06-question', false);

  // Other players answer so the board is populated.
  const state = await host.req('GET', `/api/tournaments/${tournament.id}/state`);
  const q1 = state.body.data.state.currentQuestion;
  const full = await host.req('GET', `/api/questions/${q1.id}`);
  const correct = full.body.data.question.options.find((o) => o.isCorrect).id;
  const wrong = full.body.data.question.options.find((o) => !o.isCorrect).id;

  for (const [index, s] of sessions.slice(1).entries()) {
    await s.c.req('POST', `/api/questions/${q1.id}/submit`, {
      type: 'MCQ',
      optionId: index % 3 === 0 ? wrong : correct,
    });
    await sleep(160);
  }

  // Our player picks an answer in the UI, then locks in.
  await p.getByRole('radio', { name: /Cairo/i }).click();
  await sleep(500);
  await shoot(p, '07-selected', false);

  await p.getByRole('button', { name: /lock in/i }).click();
  await sleep(1200);
  await shoot(p, '08-locked', false);

  // Close the round on its own: the verdict and recap get their beat before
  // the host calls the next round.
  await host.req('POST', `/api/tournaments/${tournament.id}/close-question`);
  await sleep(700);
  await shoot(p, '09-verdict', false);
  await sleep(2400);
  await shoot(p, '10-recap');

  // Now the photo round.
  await host.req('POST', `/api/tournaments/${tournament.id}/next-question`);
  await sleep(1400);
  await shoot(p, '11-photo-round', false);

  await p.goto(`/tournaments/${tournament.id}/leaderboard`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await shoot(p, '12-rankings');

  // End it and show the podium.
  await host.req('POST', `/api/tournaments/${tournament.id}/end`);
  await sleep(800);
  await p.goto(`/tournaments/${tournament.id}/result`, { waitUntil: 'networkidle' });
  await sleep(1800);
  await shoot(p, '13-podium');

  await p.goto('/profile', { waitUntil: 'networkidle' });
  await sleep(900);
  await shoot(p, '14-player');

  await p.goto('/history', { waitUntil: 'networkidle' });
  await sleep(800);
  await shoot(p, '15-record');

  // Small phone check for the tightest common width.
  const small = await browser.newContext({
    ...devices['iPhone SE'],
    baseURL: BASE,
    viewport: { width: 375, height: 667 },
  });
  await small.addCookies([
    {
      name: 'clash_session',
      value: me.cookie.split('=').slice(1).join('='),
      domain: 'localhost',
      path: '/',
    },
  ]);
  const sp = await small.newPage();
  await sp.goto('/dashboard', { waitUntil: 'networkidle' });
  await sleep(800);
  await shoot(sp, '16-home-375', false);

  // ================= DESKTOP (admin) =================
  console.log('desktop pass');
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
  });
  await desktop.addCookies([
    {
      name: 'clash_session',
      value: host.cookie.split('=').slice(1).join('='),
      domain: 'localhost',
      path: '/',
    },
  ]);
  const d = await desktop.newPage();

  await d.goto('/admin', { waitUntil: 'networkidle' });
  await sleep(1000);
  await shoot(d, '20-control-home');

  await d.goto(`/admin/tournaments/${tournament.id}/live`, { waitUntil: 'networkidle' });
  await sleep(1400);
  await shoot(d, '21-control-room');

  await d.goto(`/admin/tournaments/${tournament.id}/questions`, { waitUntil: 'networkidle' });
  await sleep(900);
  await shoot(d, '22-rounds');

  // Open the builder to capture the mobile preview.
  const addButton = d.getByRole('button', { name: /add round/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
    await sleep(900);
    await shoot(d, '23-builder-preview');
    await d.keyboard.press('Escape');
    await sleep(400);
  }

  await d.goto(`/admin/tournaments/${tournament.id}/results`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await shoot(d, '24-results');

  await d.goto('/admin/analytics', { waitUntil: 'networkidle' });
  await sleep(1800);
  await shoot(d, '25-analytics');

  await d.goto(`/admin/tournaments/${tournament.id}/participants`, { waitUntil: 'networkidle' });
  await sleep(900);
  await shoot(d, '26-roster');

  // Tablet check.
  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, baseURL: BASE });
  await tablet.addCookies([
    {
      name: 'clash_session',
      value: me.cookie.split('=').slice(1).join('='),
      domain: 'localhost',
      path: '/',
    },
  ]);
  const t = await tablet.newPage();
  await t.goto('/dashboard', { waitUntil: 'networkidle' });
  await sleep(900);
  await shoot(t, '30-home-tablet', false);

  await browser.close();
  console.log(`\ntournament id for cleanup: ${tournament.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
