import type {
  BadgeDTO,
  LeaderboardDTO,
  LiveTournamentStateDTO,
  NotificationDTO,
  ParticipantQuestionDTO,
  QuestionResultDTO,
  QuestionRevealDTO,
  QuestionStatsDTO,
  WaitingRoomParticipantDTO,
} from '@/types';

/**
 * The websocket contract. Both the Socket.IO server and the browser client are
 * typed against these maps, so a renamed event breaks the build instead of
 * silently breaking a live tournament.
 *
 * The server is authoritative for every value here. Notably, question payloads
 * carry absolute server timestamps (startedAt / endsAt) rather than a countdown
 * value: clients render the clock from those, and the server independently
 * enforces the deadline when a submission arrives.
 */

export const ROOM = {
  tournament: (tournamentId: string) => `tournament:${tournamentId}`,
  host: (tournamentId: string) => `tournament:${tournamentId}:host`,
  user: (userId: string) => `user:${userId}`,
};

export interface TournamentStartedPayload {
  tournamentId: string;
  startedAt: string;
  questionCount: number;
}

export interface QuestionStartedPayload {
  tournamentId: string;
  question: ParticipantQuestionDTO;
  serverNow: string;
}

export interface QuestionEndedPayload {
  tournamentId: string;
  questionId: string;
  questionIndex: number;
  reveal: QuestionRevealDTO;
  stats: QuestionStatsDTO;
  leaderboard: LeaderboardDTO;
  isLastQuestion: boolean;
}

export interface TournamentEndedPayload {
  tournamentId: string;
  finishedAt: string;
  leaderboard: LeaderboardDTO;
}

export interface PresencePayload {
  tournamentId: string;
  connectedCount: number;
  participantCount: number;
}

export interface ParticipantJoinedPayload {
  tournamentId: string;
  participant: WaitingRoomParticipantDTO;
  participantCount: number;
}

export interface SubmissionReceivedPayload {
  tournamentId: string;
  questionId: string;
  submitted: number;
  eligible: number;
}

export interface ServerToClientEvents {
  'tournament:state': (payload: LiveTournamentStateDTO) => void;
  'tournament:joined': (payload: ParticipantJoinedPayload) => void;
  'tournament:participantUpdated': (payload: ParticipantJoinedPayload) => void;
  'tournament:started': (payload: TournamentStartedPayload) => void;
  'tournament:paused': (payload: { tournamentId: string; pausedAt: string }) => void;
  'tournament:resumed': (payload: { tournamentId: string; endsAt: string | null; serverNow: string }) => void;
  'tournament:ended': (payload: TournamentEndedPayload) => void;
  'question:started': (payload: QuestionStartedPayload) => void;
  'question:submissionAck': (payload: { questionId: string; submittedAt: string }) => void;
  'question:stats': (payload: QuestionStatsDTO) => void;
  'question:submitted': (payload: SubmissionReceivedPayload) => void;
  'question:ended': (payload: QuestionEndedPayload) => void;
  'question:result': (payload: QuestionResultDTO) => void;
  'leaderboard:updated': (payload: LeaderboardDTO) => void;
  'badge:earned': (payload: { tournamentId: string | null; badge: BadgeDTO }) => void;
  'notification:new': (payload: NotificationDTO) => void;
  'presence:update': (payload: PresencePayload) => void;
  'server:error': (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'tournament:subscribe': (
    payload: { tournamentId: string },
    ack?: (result: { ok: boolean; state?: LiveTournamentStateDTO; error?: string }) => void,
  ) => void;
  'tournament:unsubscribe': (payload: { tournamentId: string }) => void;
  'time:sync': (ack: (serverNow: number) => void) => void;
}

export interface SocketData {
  userId: string;
  role: 'ADMIN' | 'PARTICIPANT';
  username: string;
  displayName: string;
  subscribedTournamentIds: Set<string>;
}

/** Audit-log event names, also used as TournamentEvent.type values. */
export const TOURNAMENT_EVENT = {
  CREATED: 'TOURNAMENT_CREATED',
  UPDATED: 'TOURNAMENT_UPDATED',
  PUBLISHED: 'TOURNAMENT_PUBLISHED',
  UNPUBLISHED: 'TOURNAMENT_UNPUBLISHED',
  WAITING_ROOM_OPENED: 'WAITING_ROOM_OPENED',
  STARTED: 'TOURNAMENT_STARTED',
  PAUSED: 'TOURNAMENT_PAUSED',
  RESUMED: 'TOURNAMENT_RESUMED',
  ENDED: 'TOURNAMENT_ENDED',
  ARCHIVED: 'TOURNAMENT_ARCHIVED',
  QUESTION_STARTED: 'QUESTION_STARTED',
  QUESTION_CLOSED: 'QUESTION_CLOSED',
  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_APPROVED: 'PARTICIPANT_APPROVED',
  PARTICIPANT_DISQUALIFIED: 'PARTICIPANT_DISQUALIFIED',
  SUBMISSION_GRADED: 'SUBMISSION_GRADED',
  SCORE_OVERRIDDEN: 'SCORE_OVERRIDDEN',
  RESULTS_EXPORTED: 'RESULTS_EXPORTED',
} as const;

export type TournamentEventType = (typeof TOURNAMENT_EVENT)[keyof typeof TOURNAMENT_EVENT];
