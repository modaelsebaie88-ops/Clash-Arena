/**
 * Demo data for Clash Arena.
 *
 *   npm run db:seed
 *
 * Creates one host account, ten players, two tournaments (one open for
 * registration with a full mixed-type question set, one still a draft), and a
 * handful of players already joined so the waiting room is not empty.
 *
 * Safe to run repeatedly: the demo tournaments are keyed by code and rebuilt.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = (await import('bcryptjs')).default;
  const { DEFAULT_SCORING_CONFIG } = await import('../src/lib/services/scoring-service');
  const { DEFAULT_TIE_BREAKERS } = await import('../src/lib/services/leaderboard-service');
  const { BADGE_DEFINITIONS } = await import('../src/lib/services/badge-service');

  const prisma = new PrismaClient();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clasharena.dev';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const playerPassword = process.env.SEED_PARTICIPANT_PASSWORD ?? 'Player123!';

  console.log('> seeding badges');
  for (const badge of BADGE_DEFINITIONS) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: badge,
      create: badge,
    });
  }

  console.log('> seeding accounts');
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const playerHash = await bcrypt.hash(playerPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', passwordHash: adminHash },
    create: {
      email: adminEmail,
      username: 'host',
      displayName: 'Tournament Host',
      passwordHash: adminHash,
      role: 'ADMIN',
      bio: 'Runs the Clash Arena demo tournaments.',
    },
  });

  const playerSeeds = [
    { username: 'ahmed', displayName: 'Ahmed' },
    { username: 'mahmoud', displayName: 'Mahmoud' },
    { username: 'omar', displayName: 'Omar' },
    { username: 'youssef', displayName: 'Youssef' },
    { username: 'karim', displayName: 'Karim' },
    { username: 'lina', displayName: 'Lina' },
    { username: 'sara', displayName: 'Sara' },
    { username: 'nour', displayName: 'Nour' },
    { username: 'hana', displayName: 'Hana' },
    { username: 'tarek', displayName: 'Tarek' },
  ];

  const players = [];
  for (const seed of playerSeeds) {
    const player = await prisma.user.upsert({
      where: { email: `${seed.username}@clasharena.dev` },
      update: { passwordHash: playerHash },
      create: {
        email: `${seed.username}@clasharena.dev`,
        username: seed.username,
        displayName: seed.displayName,
        passwordHash: playerHash,
        role: 'PARTICIPANT',
      },
    });
    players.push(player);
  }

  // ---------------------------------------------------------------------
  // Tournament 1: open for registration, ten mixed-type questions
  // ---------------------------------------------------------------------
  console.log('> seeding tournaments');
  await prisma.tournament.deleteMany({ where: { code: { in: ['PLAY-AI26', 'PLAY-MATH'] } } });

  const aiChallenge = await prisma.tournament.create({
    data: {
      code: 'PLAY-AI26',
      name: 'AI Challenge 2026',
      description:
        'Ten rapid-fire questions on machine learning fundamentals. Fastest correct answers take the crown.',
      rules:
        'One answer per question. The clock is enforced by the server. Speed bonuses reward fast, correct answers, and a streak bonus stacks on top.',
      status: 'REGISTRATION_OPEN',
      startAt: new Date(Date.now() + 30 * 60 * 1000),
      maxParticipants: 200,
      joinByCodeEnabled: true,
      requireApproval: false,
      allowLateJoin: true,
      showLeaderboardAfterQuestion: true,
      showAnswersToParticipants: true,
      defaultTimeLimitSeconds: 30,
      defaultBasePoints: 100,
      scoringConfig: DEFAULT_SCORING_CONFIG as never,
      tieBreakers: DEFAULT_TIE_BREAKERS as never,
      hostId: admin.id,
    },
  });

  const aiQuestions = [
    {
      type: 'MCQ' as const,
      prompt: 'What is the capital of Egypt?',
      explanation: 'Cairo has been the capital since 1168.',
      timeLimitSeconds: 20,
      options: ['Alexandria', 'Cairo', 'Giza', 'Luxor'],
      correctIndex: 1,
    },
    {
      type: 'MCQ' as const,
      prompt: 'Which architecture introduced the paper "Attention Is All You Need"?',
      explanation: 'The Transformer, published by Google Brain and Google Research in 2017.',
      timeLimitSeconds: 25,
      options: ['LSTM', 'Transformer', 'ResNet', 'GAN'],
      correctIndex: 1,
    },
    {
      type: 'TRUE_FALSE' as const,
      prompt: 'A neural network without non-linear activations can only represent linear functions.',
      explanation: 'Stacking linear layers collapses into a single linear transformation.',
      timeLimitSeconds: 20,
      correctValue: true,
    },
    {
      type: 'MCQ' as const,
      prompt: 'Which of these is NOT a supervised learning task?',
      explanation: 'Clustering works on unlabelled data, so it is unsupervised.',
      timeLimitSeconds: 25,
      options: ['Classification', 'Regression', 'K-means clustering', 'Sequence labelling'],
      correctIndex: 2,
    },
    {
      type: 'SHORT_ANSWER' as const,
      prompt: 'What does GPU stand for?',
      explanation: 'Graphics Processing Unit.',
      timeLimitSeconds: 25,
      accepted: ['graphics processing unit', 'graphic processing unit'],
    },
    {
      type: 'NUMERIC' as const,
      prompt: 'How many encoder layers were in the original Transformer model?',
      explanation: 'Six encoder layers and six decoder layers.',
      timeLimitSeconds: 20,
      correctNumber: 6,
      tolerance: 0,
    },
    {
      type: 'MCQ' as const,
      prompt: 'Which technique most directly reduces overfitting in a deep network?',
      explanation: 'Dropout randomly removes units during training, limiting co-adaptation.',
      timeLimitSeconds: 25,
      options: ['Dropout', 'Increasing model depth', 'Lowering the batch size', 'Removing the validation set'],
      correctIndex: 0,
    },
    {
      type: 'IMAGE_SUBMISSION' as const,
      prompt:
        'Solve: a model has 90% precision and 60% recall. Work out the F1 score and show your full calculation. Photograph your handwritten steps and upload them.',
      explanation: 'F1 = 2PR / (P + R) = 2(0.9)(0.6) / 1.5 = 0.72.',
      timeLimitSeconds: 180,
      instructions: 'Show every step, including the formula you used.',
    },
    {
      type: 'MCQ' as const,
      prompt: 'Gradient descent updates parameters in which direction?',
      explanation: 'Opposite the gradient, because the gradient points uphill.',
      timeLimitSeconds: 20,
      options: [
        'The direction of the gradient',
        'The opposite of the gradient',
        'A random direction',
        'Perpendicular to the gradient',
      ],
      correctIndex: 1,
    },
    {
      type: 'NUMERIC' as const,
      prompt: 'A model scores 40 out of 50 on a test set. What is its accuracy as a percentage?',
      explanation: '40 / 50 = 0.8, which is 80%.',
      timeLimitSeconds: 20,
      correctNumber: 80,
      tolerance: 0.5,
    },
  ];

  for (const [index, question] of aiQuestions.entries()) {
    const base = {
      tournamentId: aiChallenge.id,
      order: index,
      prompt: question.prompt,
      explanation: question.explanation,
      timeLimitSeconds: question.timeLimitSeconds,
      basePoints: 100,
      speedBonusPoints: 50,
    };

    if (question.type === 'MCQ') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'MCQ',
          options: {
            create: question.options.map((text, optionIndex) => ({
              text,
              order: optionIndex,
              isCorrect: optionIndex === question.correctIndex,
            })),
          },
        },
      });
    } else if (question.type === 'TRUE_FALSE') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'TRUE_FALSE',
          answerKey: { value: question.correctValue },
          options: {
            create: [
              { text: 'True', order: 0, isCorrect: question.correctValue === true },
              { text: 'False', order: 1, isCorrect: question.correctValue === false },
            ],
          },
        },
      });
    } else if (question.type === 'SHORT_ANSWER') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'SHORT_ANSWER',
          answerKey: { accepted: question.accepted, caseSensitive: false },
        },
      });
    } else if (question.type === 'NUMERIC') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'NUMERIC',
          answerKey: { value: question.correctNumber, tolerance: question.tolerance },
        },
      });
    } else {
      await prisma.question.create({
        data: {
          ...base,
          type: 'IMAGE_SUBMISSION',
          requiresManualGrading: true,
          basePoints: 150,
          speedBonusPoints: 0,
          answerKey: { instructions: question.instructions },
        },
      });
    }
  }

  // Half the roster is already waiting in the lobby.
  for (const player of players.slice(0, 6)) {
    await prisma.tournamentParticipant.create({
      data: {
        tournamentId: aiChallenge.id,
        userId: player.id,
        status: 'ACTIVE',
        approvedAt: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Tournament 2: still a draft, shows the question builder in progress
  // ---------------------------------------------------------------------
  const mathSprint = await prisma.tournament.create({
    data: {
      code: 'PLAY-MATH',
      name: 'Math Sprint: Algebra Cup',
      description:
        'Six algebra problems, including one where you photograph your handwritten working for the host to grade.',
      rules: 'Show your steps on the written question. Partial credit is available.',
      status: 'DRAFT',
      maxParticipants: 100,
      defaultTimeLimitSeconds: 45,
      defaultBasePoints: 120,
      showLeaderboardAfterQuestion: true,
      showAnswersToParticipants: true,
      scoringConfig: {
        ...DEFAULT_SCORING_CONFIG,
        correctPoints: 120,
        speedBonusPoints: 60,
        streakBonusPoints: 15,
      } as never,
      tieBreakers: DEFAULT_TIE_BREAKERS as never,
      hostId: admin.id,
    },
  });

  const mathQuestions = [
    {
      type: 'NUMERIC' as const,
      prompt: 'Solve for x: 3x + 7 = 25',
      explanation: '3x = 18, so x = 6.',
      correctNumber: 6,
      tolerance: 0,
    },
    {
      type: 'MCQ' as const,
      prompt: 'Which expression is equivalent to (x + 3)(x - 3)?',
      explanation: 'Difference of two squares.',
      options: ['x² - 9', 'x² + 9', 'x² - 6x + 9', 'x² + 6x + 9'],
      correctIndex: 0,
    },
    {
      type: 'NUMERIC' as const,
      prompt: 'What is the slope of the line through (2, 3) and (6, 11)?',
      explanation: '(11 - 3) / (6 - 2) = 2.',
      correctNumber: 2,
      tolerance: 0,
    },
    {
      type: 'TRUE_FALSE' as const,
      prompt: 'The quadratic x² + 1 has two real roots.',
      explanation: 'Its discriminant is negative, so both roots are complex.',
      correctValue: false,
    },
    {
      type: 'IMAGE_SUBMISSION' as const,
      prompt:
        'Solve the quadratic 2x² - 5x - 3 = 0 by factorising. Photograph your complete working and upload it.',
      explanation: '(2x + 1)(x - 3) = 0, so x = -1/2 or x = 3.',
      instructions: 'Every line of working must be visible in the photo.',
    },
    {
      type: 'SHORT_ANSWER' as const,
      prompt: 'What is the name of the formula used to solve any quadratic equation?',
      explanation: 'The quadratic formula.',
      accepted: ['quadratic formula', 'the quadratic formula'],
    },
  ];

  for (const [index, question] of mathQuestions.entries()) {
    const base = {
      tournamentId: mathSprint.id,
      order: index,
      prompt: question.prompt,
      explanation: question.explanation,
      timeLimitSeconds: 45,
      basePoints: 120,
      speedBonusPoints: 60,
    };

    if (question.type === 'MCQ') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'MCQ',
          options: {
            create: question.options.map((text, optionIndex) => ({
              text,
              order: optionIndex,
              isCorrect: optionIndex === question.correctIndex,
            })),
          },
        },
      });
    } else if (question.type === 'TRUE_FALSE') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'TRUE_FALSE',
          answerKey: { value: question.correctValue },
          options: {
            create: [
              { text: 'True', order: 0, isCorrect: question.correctValue === true },
              { text: 'False', order: 1, isCorrect: question.correctValue === false },
            ],
          },
        },
      });
    } else if (question.type === 'SHORT_ANSWER') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'SHORT_ANSWER',
          answerKey: { accepted: question.accepted, caseSensitive: false },
        },
      });
    } else if (question.type === 'NUMERIC') {
      await prisma.question.create({
        data: {
          ...base,
          type: 'NUMERIC',
          answerKey: { value: question.correctNumber, tolerance: question.tolerance },
        },
      });
    } else {
      await prisma.question.create({
        data: {
          ...base,
          type: 'IMAGE_SUBMISSION',
          requiresManualGrading: true,
          timeLimitSeconds: 240,
          speedBonusPoints: 0,
          answerKey: { instructions: question.instructions },
        },
      });
    }
  }

  console.log('\nSeed complete.\n');
  console.log(`  Host     ${adminEmail} / ${adminPassword}`);
  console.log(`  Players  ahmed@clasharena.dev ... tarek@clasharena.dev / ${playerPassword}`);
  console.log(`  Codes    PLAY-AI26 (open for registration), PLAY-MATH (draft)\n`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
