// rule.md 전체를 코드로 표현하기 위한 타입 정의.
import type { Card } from './cards.js';

/** 플레이어는 0번, 1번 두 명. */
export type PlayerId = 0 | 1;

export const TARGET_SCORE = 12; // 누적 12점 이상 시 게임 승리 (rule.md §4)
export const MIN_STAKE = 1; // (rule.md §6)
export const MAX_STAKE = 12; // (rule.md §6, §8)

/**
 * 라운드 내부 진행 단계.
 * (rule.md §11~§23 흐름을 상태 머신으로 표현)
 */
export type GamePhase =
  | 'ROUND_START' // 새 라운드 대기 — 서버가 셔플된 덱으로 START_ROUND 를 보내야 함
  | 'REDISTRIBUTION_OFFER' // 비딜러가 재분배 요청 여부 결정 (§11)
  | 'REDISTRIBUTION_RESPONSE' // 딜러가 재분배 수락/거절 (§11)
  | 'LEADER_PLAY' // 선공이 카드 제출 + 유지/인상/포기 (§14)
  | 'FOLLOWER_PLAY' // 후공이 카드 제출 or 포기 (§12, §18)
  | 'BETTING' // 인상 제안에 대한 응답: 수락/재인상/포기 (§15, §16)
  | 'TRICK_REVEAL' // 양쪽 카드 동시 공개 결과 표시 (§19, §20)
  | 'ROUND_OVER' // 라운드 종료·승점 지급 결과 표시 (§21~§24)
  | 'GAME_OVER'; // 누적 12점 이상 도달 (§26)

/** 승부(Trick) 결과. */
export interface TrickResult {
  index: number; // 0,1,2
  leader: PlayerId;
  cards: [Card, Card]; // [player0 카드, player1 카드]
  winner: PlayerId | null; // null = 무승부 (§20)
}

/** 진행 중인 승부 상태. */
export interface CurrentTrick {
  index: number;
  leader: PlayerId;
  /** 뒷면으로 제출(커밋)된 카드. 공개 전까지 서버만 실제 값을 안다. */
  committed: [Card | null, Card | null];
}

export type RoundEndReason =
  | 'twoWins' // 2승 달성 (§21)
  | 'tiebreak' // 3승부 후 판정 (§22)
  | 'forfeit' // 포기 (§17, §18)
  | 'void'; // 3무 무효 라운드 (§23)

export interface RoundResult {
  winner: PlayerId | null; // null = 무효 라운드
  stakeAwarded: number; // 승자가 획득한 승점 (무효면 0)
  reason: RoundEndReason;
}

/**
 * 전체 게임 상태. 서버만 완전한 형태로 보유한다(양쪽 손패·뒷면 카드 포함).
 * 클라이언트에는 redactStateFor 로 가려진 뷰만 전달된다.
 */
export interface GameState {
  phase: GamePhase;

  // 게임 전역
  scores: [number, number]; // 누적 점수 (§4)
  dealer: PlayerId; // 현재 딜러 (§9)
  roundNumber: number; // 1부터 시작

  // 라운드 스코프
  hands: [Card[], Card[]]; // 각 플레이어 손패 (서버 전용 실제 값)
  deck: Card[]; // 남은 라운드 덱 (§10)
  discarded: Card[]; // 재분배로 폐기된 카드 (§11)
  currentStake: number; // 현재 확정 승점 (§6)
  proposedStake: number | null; // 대기 중 제안 승점 (§14)
  proposer: PlayerId | null; // 대기 중 제안을 한 플레이어 (§15, §16)
  redistributionRequested: boolean; // 이번 라운드 재분배 요청이 사용되었는지 (§11)
  trickWins: [number, number]; // 각 플레이어 승부 승리 횟수 (§21)
  trickHistory: TrickResult[];
  currentTrick: CurrentTrick | null;

  turn: PlayerId | null; // 현재 행동이 기대되는 플레이어 (null = 대기/자동 진행)
  lastTrickResult: TrickResult | null; // TRICK_REVEAL 표시용
  lastRoundResult: RoundResult | null; // ROUND_OVER 표시용
  winner: PlayerId | null; // 게임 최종 승자 (§26)
}

// ─────────────────────────────────────────────────────────────
// 액션 (플레이어 → 엔진)
// ─────────────────────────────────────────────────────────────

export type Action =
  | { type: 'START_ROUND'; deck: Card[] } // 서버가 셔플된 32장 덱과 함께 발행
  | { type: 'REQUEST_REDISTRIBUTION'; player: PlayerId }
  | { type: 'DECLINE_REDISTRIBUTION'; player: PlayerId }
  | { type: 'RESPOND_REDISTRIBUTION'; player: PlayerId; accept: boolean }
  | { type: 'PLAY_CARD'; player: PlayerId; cardId: string; raiseTo?: number }
  | {
      type: 'RESPOND_RAISE';
      player: PlayerId;
      response: 'accept' | 'reRaise' | 'forfeit';
      raiseTo?: number;
    }
  | { type: 'FORFEIT'; player: PlayerId }
  | { type: 'PROCEED'; player: PlayerId }; // 공개/라운드 결과 확인 후 진행

// ─────────────────────────────────────────────────────────────
// 이벤트 (엔진 → 표시용 로그)
// ─────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'ROUND_STARTED'; roundNumber: number; dealer: PlayerId }
  | { type: 'REDISTRIBUTION'; accepted: boolean }
  | { type: 'CARD_PLAYED'; player: PlayerId }
  | { type: 'RAISE_PROPOSED'; player: PlayerId; from: number; to: number }
  | { type: 'RAISE_ACCEPTED'; player: PlayerId; stake: number }
  | { type: 'TRICK_REVEALED'; result: TrickResult; currentStake: number }
  | { type: 'FORFEITED'; player: PlayerId; winner: PlayerId; stake: number }
  | { type: 'ROUND_ENDED'; result: RoundResult; scores: [number, number] }
  | { type: 'GAME_OVER'; winner: PlayerId };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  /** 유효하지 않은 액션이면 상태는 변하지 않고 error 메시지를 담는다. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// 사용 가능 행동 (엔진 → 서버 → 클라이언트)
// 프런트는 이 목록만 보고 UI 를 구성한다. 규칙 판정을 프런트에서 하지 않는다.
// ─────────────────────────────────────────────────────────────

export type AvailableAction =
  | { type: 'REQUEST_REDISTRIBUTION' }
  | { type: 'DECLINE_REDISTRIBUTION' }
  | { type: 'RESPOND_REDISTRIBUTION' } // accept/reject 는 클라이언트가 선택
  | {
      type: 'PLAY_CARD';
      /** 카드 제출 시 인상 가능 여부와 범위 (선공만 인상 개시 가능) */
      canRaise: boolean;
      raiseMin?: number;
      raiseMax?: number;
    }
  | {
      type: 'RESPOND_RAISE';
      canReRaise: boolean;
      raiseMin?: number;
      raiseMax?: number;
    }
  | { type: 'FORFEIT' }
  | { type: 'PROCEED' };

// ─────────────────────────────────────────────────────────────
// 가려진 공개 상태 (서버 → 클라이언트)
// ─────────────────────────────────────────────────────────────

/** 상대 손패는 장수만, 미공개 제출 카드는 커밋 여부만 노출한다. */
export interface PublicGameState {
  phase: GamePhase;
  you: PlayerId;
  scores: [number, number];
  dealer: PlayerId;
  roundNumber: number;

  yourHand: Card[];
  opponentHandCount: number;
  deckCount: number;

  currentStake: number;
  proposedStake: number | null;
  proposer: PlayerId | null;
  redistributionRequested: boolean;

  trickWins: [number, number];
  trickHistory: TrickResult[];

  /** 진행 중 승부에서 각 플레이어가 카드를 커밋했는지. 공개 전에는 값 자체는 감춘다. */
  committed: [boolean, boolean];
  /** 내가 이번 승부에 제출한 카드(내 카드이므로 나에게는 공개). 상대 카드는 절대 포함하지 않는다. */
  yourCommitted: Card | null;
  /** TRICK_REVEAL 단계에서만 채워진다(양쪽 카드 공개). */
  revealedTrick: TrickResult | null;

  turn: PlayerId | null;
  lastRoundResult: RoundResult | null;
  winner: PlayerId | null;

  /** 이 플레이어가 지금 할 수 있는 행동. 자신의 차례가 아니면 빈 배열. */
  availableActions: AvailableAction[];
}
