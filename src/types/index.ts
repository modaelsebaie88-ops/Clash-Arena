/**
 * Transport shapes shared by the API, the websocket layer and the UI.
 * Everything here is client-safe: types plus plain string unions only.
 */

export type RoleDTO = 'ADMIN' | 'PARTICIPANT';

export type TournamentStatusDTO =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'WAITING'
  | 'LIVE'
  | 'PAUSED'
  | 'FINISHED'
  | 'ARCHIVED';

export type QuestionTypeDTO =
  | 'MCQ'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'NUMERIC'
  | 'IMAGE_SUBMISSION';

export type QuestionStatusDTO = 'UPCOMING' | 'ACTIVE' | 'CLOSED';

export type ParticipantStatusDTO = 'PENDING' | 'ACTIVE' | 'DISQUALIFIED';

export type SubmissionOutcomeDTO = 'PENDING' | 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'NO_ANSWER';

export interface PublicUserDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SessionUserDTO extends PublicUserDTO {
  email: string;
  role: RoleDTO;
  bio: string | null;
  totalTournaments: number;
  totalWins: number;
  totalPoints: number;
  createdAt: string;
}

/** Answer payloads accepted by POST /api/questions/:id/submit. */
export type AnswerPayload =
  | { type: 'MCQ'; optionId: string }
  | { type: 'TRUE_FALSE'; optionId: string }
  | { type: 'SHORT_ANSWER'; text: string }
  | { type: 'NUMERIC'; value: number }
  | { type: 'IMAGE_SUBMISSION'; fileId: string };

/** Question as a participant is allowed to see it while it is open. */
export interface ParticipantQuestionDTO {
  id: string;
  order: number;
  index: number;
  totalQuestions: number;
  type: QuestionTypeDTO;
  prompt: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusPoints: number;
  status: QuestionStatusDTO;
  startedAt: string | null;
  endsAt: string | null;
  options: Array<{ id: string; order: number; text: string; imageUrl: string | null }>;
  requiresUpload: boolean;
  requiresManualGrading: boolean;
}

/** Only ever sent once a question is CLOSED. */
export interface QuestionRevealDTO {
  questionId: string;
  correctOptionIds: string[];
  correctAnswerText: string | null;
  explanation: string | null;
}

export interface QuestionStatsDTO {
  questionId: string;
  index: number;
  submitted: number;
  connected: number;
  eligible: number;
  waiting: number;
  correct: number;
  incorrect: number;
  pendingReview: number;
  averageResponseMs: number | null;
  optionBreakdown: Array<{ optionId: string; label: string; count: number; isCorrect: boolean }>;
}

export interface LeaderboardEntryDTO {
  participantId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rank: number;
  previousRank: number | null;
  rankDelta: number | null;
  totalPoints: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  averageResponseMs: number | null;
  fastestResponseMs: number | null;
  currentStreak: number;
  bestStreak: number;
  status: ParticipantStatusDTO;
}

export interface LeaderboardDTO {
  tournamentId: string;
  entries: LeaderboardEntryDTO[];
  total: number;
  updatedAt: string;
  questionOrder: number | null;
}

export interface BadgeDTO {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

/** Personal post-question feedback, sent privately to one participant. */
export interface QuestionResultDTO {
  questionId: string;
  questionIndex: number;
  outcome: SubmissionOutcomeDTO;
  awardedPoints: number;
  basePoints: number;
  speedBonus: number;
  responseTimeMs: number | null;
  answerSummary: string | null;
  reveal: QuestionRevealDTO | null;
  rank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
  totalPoints: number;
  currentStreak: number;
  badges: BadgeDTO[];
  awaitingReview: boolean;
}

export interface LiveTournamentStateDTO {
  id: string;
  code: string;
  name: string;
  status: TournamentStatusDTO;
  questionCount: number;
  currentQuestionIndex: number | null;
  currentQuestion: ParticipantQuestionDTO | null;
  serverNow: string;
  participantCount: number;
  connectedCount: number;
  showLeaderboardAfterQuestion: boolean;
  showAnswersToParticipants: boolean;
  /** Set when the signed-in participant already answered the open question. */
  mySubmission: { questionId: string; submittedAt: string; answerSummary: string | null } | null;
}

export interface WaitingRoomParticipantDTO extends PublicUserDTO {
  participantId: string;
  joinedAt: string;
  status: ParticipantStatusDTO;
  connected: boolean;
}

export interface TournamentSummaryDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  status: TournamentStatusDTO;
  startAt: string | null;
  endAt: string | null;
  maxParticipants: number;
  participantCount: number;
  questionCount: number;
  joinByCodeEnabled: boolean;
  requireApproval: boolean;
  host: PublicUserDTO;
  createdAt: string;
  /** Present when the request is authenticated. */
  myParticipation?: {
    participantId: string;
    status: ParticipantStatusDTO;
    rank: number | null;
    finalRank: number | null;
    totalPoints: number;
  } | null;
}

export interface ScoringConfigDTO {
  formula: 'LINEAR_SPEED_BONUS' | 'STEPPED_SPEED_BONUS' | 'FLAT';
  correctPoints: number;
  speedBonusEnabled: boolean;
  speedBonusPoints: number;
  wrongAnswerPoints: number;
  noAnswerPoints: number;
  partialCreditEnabled: boolean;
  streakBonusEnabled: boolean;
  streakBonusPoints: number;
  streakBonusCap: number;
  minimumSpeedRatio: number;
}

export type TieBreakerKey =
  | 'TOTAL_POINTS'
  | 'CORRECT_COUNT'
  | 'TOTAL_RESPONSE_TIME'
  | 'EARLIEST_LAST_SUBMISSION'
  | 'BEST_STREAK';

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface PersonalStatsDTO {
  fastestAnswerMs: number | null;
  correctCount: number;
  totalQuestions: number;
  bestStreak: number;
  bestRank: number | null;
  averageResponseMs: number | null;
  totalPoints: number;
  finalRank: number | null;
}
