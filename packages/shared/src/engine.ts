// rule.md §5~§27 을 코드로 구현한 순수 함수형 게임 엔진.
// 서버만 이 엔진을 권위적으로 실행한다. 규칙의 유일한 기준은 rule.md 이다.
import type { Card } from './cards.js';
import {
  MAX_STAKE,
  MIN_STAKE,
  TARGET_SCORE,
  type Action,
  type ApplyResult,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RoundEndReason,
  type TrickResult,
} from './types.js';
import {
  evaluateRound,
  nextLeader,
  otherPlayer,
  resolveTrickWinner,
  roundMaxStake,
} from './resolution.js';

/** 게임 초기 상태. firstDealer 는 서버가 무작위로 정한다. (rule.md §9) */
export function initGame(firstDealer: PlayerId): GameState {
  return {
    phase: 'ROUND_START',
    scores: [0, 0],
    dealer: firstDealer,
    roundNumber: 0,
    hands: [[], []],
    deck: [],
    discarded: [],
    currentStake: MIN_STAKE,
    proposedStake: null,
    proposer: null,
    redistributionRequested: false,
    trickWins: [0, 0],
    trickHistory: [],
    currentTrick: null,
    turn: null,
    lastTrickResult: null,
    lastRoundResult: null,
    winner: null,
  };
}

function clone(s: GameState): GameState {
  return {
    ...s,
    scores: [s.scores[0], s.scores[1]],
    hands: [[...s.hands[0]], [...s.hands[1]]],
    deck: [...s.deck],
    discarded: [...s.discarded],
    trickWins: [s.trickWins[0], s.trickWins[1]],
    trickHistory: s.trickHistory.map((t) => ({ ...t, cards: [t.cards[0], t.cards[1]] })),
    currentTrick: s.currentTrick
      ? { ...s.currentTrick, committed: [s.currentTrick.committed[0], s.currentTrick.committed[1]] }
      : null,
  };
}

const err = (state: GameState, message: string): ApplyResult => ({ state, events: [], error: message });

/** 인상 값 유효성 검사. base 보다 크고 유효 최대 승점(max) 이하의 정수여야 한다. (rule.md §7, §8) */
function validateRaise(base: number, max: number, to: number | undefined): string | null {
  if (to === undefined) return '인상 승점이 지정되지 않았습니다.';
  if (!Number.isInteger(to)) return '승점은 정수 단위로 제안해야 합니다.';
  if (to <= base) return `새 제안 승점(${to})은 현재 확정 승점(${base})보다 커야 합니다.`;
  if (to > max) return `현재 상황의 유효 최대 승점(${max}점)까지만 제안할 수 있습니다.`;
  return null;
}

/** 카드 3장씩 배분. 비딜러부터 번갈아 1장씩. (rule.md §10) */
function deal(deck: Card[], dealer: PlayerId): { hands: [Card[], Card[]]; remaining: Card[] } {
  const nonDealer = otherPlayer(dealer);
  const hands: [Card[], Card[]] = [[], []];
  let i = 0;
  for (let n = 0; n < 3; n++) {
    hands[nonDealer].push(deck[i++]);
    hands[dealer].push(deck[i++]);
  }
  return { hands, remaining: deck.slice(6) };
}

/** 첫 번째 승부를 준비한다. 선공은 비딜러. (rule.md §13) */
function startFirstTrick(s: GameState): void {
  const leader = otherPlayer(s.dealer);
  s.currentTrick = { index: 0, leader, committed: [null, null] };
  s.phase = 'LEADER_PLAY';
  s.turn = leader;
}

/** 라운드 종료 및 승점 지급. (rule.md §24, §26) */
function endRound(
  s: GameState,
  events: GameEvent[],
  winner: PlayerId | null,
  reason: RoundEndReason,
): void {
  const stakeAwarded = winner !== null ? s.currentStake : 0;
  if (winner !== null) {
    s.scores[winner] += stakeAwarded;
  }
  s.lastRoundResult = { winner, stakeAwarded, reason };
  s.turn = null;
  s.currentTrick = null;
  s.proposedStake = null;
  s.proposer = null;
  events.push({ type: 'ROUND_ENDED', result: s.lastRoundResult, scores: [s.scores[0], s.scores[1]] });

  // 누적 12점 이상이면 즉시 게임 종료 (rule.md §4, §26)
  if (winner !== null && s.scores[winner] >= TARGET_SCORE) {
    s.winner = winner;
    s.phase = 'GAME_OVER';
    events.push({ type: 'GAME_OVER', winner });
  } else {
    s.phase = 'ROUND_OVER';
  }
}

/** 양쪽 커밋 카드를 동시 공개하고 승부를 판정한다. (rule.md §19, §20) */
function revealTrick(s: GameState, events: GameEvent[]): void {
  const trick = s.currentTrick!;
  const leaderCard = trick.committed[trick.leader]!;
  const followerCard = trick.committed[otherPlayer(trick.leader)]!;
  const winner = resolveTrickWinner(leaderCard, followerCard, trick.leader);

  const result: TrickResult = {
    index: trick.index,
    leader: trick.leader,
    cards: [trick.committed[0]!, trick.committed[1]!],
    winner,
  };
  s.trickHistory.push(result);
  if (winner !== null) s.trickWins[winner] += 1;
  s.lastTrickResult = result;
  s.phase = 'TRICK_REVEAL';
  s.turn = null;
  events.push({ type: 'TRICK_REVEALED', result, currentStake: s.currentStake });
}

// ─────────────────────────────────────────────────────────────
// 메인 리듀서
// ─────────────────────────────────────────────────────────────

export function applyAction(prev: GameState, action: Action): ApplyResult {
  const s = clone(prev);
  const events: GameEvent[] = [];

  switch (action.type) {
    // ── 새 라운드 시작 (서버가 셔플된 덱과 함께 발행) ──
    case 'START_ROUND': {
      if (s.phase !== 'ROUND_START' && s.phase !== 'ROUND_OVER') {
        return err(prev, '지금은 새 라운드를 시작할 수 없습니다.');
      }
      if (s.winner !== null) return err(prev, '게임이 이미 종료되었습니다.');
      if (action.deck.length !== 32) return err(prev, '덱은 32장이어야 합니다.');

      const isFirst = s.roundNumber === 0;
      s.dealer = isFirst ? s.dealer : otherPlayer(s.dealer); // 라운드마다 딜러 교대 (§9)
      s.roundNumber += 1;

      const { hands, remaining } = deal(action.deck, s.dealer);
      s.hands = hands;
      s.deck = remaining;
      s.discarded = [];
      s.currentStake = MIN_STAKE; // 라운드 승점 1점 초기화 (§6, §27)
      s.proposedStake = null;
      s.proposer = null;
      s.redistributionRequested = false;
      s.trickWins = [0, 0];
      s.trickHistory = [];
      s.currentTrick = null;
      s.lastTrickResult = null;
      s.lastRoundResult = null;

      // 첫 승부 전, 비딜러가 재분배 요청 여부 결정 (§11)
      s.phase = 'REDISTRIBUTION_OFFER';
      s.turn = otherPlayer(s.dealer);
      events.push({ type: 'ROUND_STARTED', roundNumber: s.roundNumber, dealer: s.dealer });
      return { state: s, events };
    }

    // ── 재분배 요청 (비딜러) ──
    case 'REQUEST_REDISTRIBUTION': {
      if (s.phase !== 'REDISTRIBUTION_OFFER' || action.player !== s.turn) {
        return err(prev, '지금은 재분배를 요청할 수 없습니다.');
      }
      s.redistributionRequested = true;
      s.phase = 'REDISTRIBUTION_RESPONSE';
      s.turn = s.dealer; // 딜러가 수락/거절 (§11)
      return { state: s, events };
    }

    case 'DECLINE_REDISTRIBUTION': {
      if (s.phase !== 'REDISTRIBUTION_OFFER' || action.player !== s.turn) {
        return err(prev, '지금은 재분배 결정을 할 수 없습니다.');
      }
      startFirstTrick(s);
      return { state: s, events };
    }

    // ── 재분배 수락/거절 (딜러) ──
    case 'RESPOND_REDISTRIBUTION': {
      if (s.phase !== 'REDISTRIBUTION_RESPONSE' || action.player !== s.turn) {
        return err(prev, '지금은 재분배에 응답할 수 없습니다.');
      }
      if (action.accept) {
        // 기존 6장 폐기(이번 라운드 재사용 불가) 후 남은 덱에서 다시 3장씩 (§11)
        s.discarded.push(...s.hands[0], ...s.hands[1]);
        const { hands, remaining } = deal(s.deck, s.dealer);
        s.hands = hands;
        s.deck = remaining;
      }
      events.push({ type: 'REDISTRIBUTION', accepted: action.accept });
      startFirstTrick(s);
      return { state: s, events };
    }

    // ── 카드 제출 (선공/후공) ──
    case 'PLAY_CARD': {
      if (s.phase !== 'LEADER_PLAY' && s.phase !== 'FOLLOWER_PLAY') {
        return err(prev, '지금은 카드를 제출할 수 없습니다.');
      }
      if (action.player !== s.turn) return err(prev, '당신의 차례가 아닙니다.');

      const hand = s.hands[action.player];
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx === -1) return err(prev, '손패에 없는 카드입니다.');

      const isLeader = s.phase === 'LEADER_PLAY';

      // 인상은 선공(리더)만 개시할 수 있다. (확정 해석 1)
      if (action.raiseTo !== undefined && !isLeader) {
        return err(prev, '후공은 인상을 개시할 수 없습니다.');
      }
      if (action.raiseTo !== undefined) {
        const vErr = validateRaise(s.currentStake, roundMaxStake(s.scores), action.raiseTo);
        if (vErr) return err(prev, vErr);
      }

      // 카드 커밋(뒷면 제출)
      const [card] = hand.splice(idx, 1);
      s.currentTrick!.committed[action.player] = card;
      events.push({ type: 'CARD_PLAYED', player: action.player });

      if (isLeader) {
        if (action.raiseTo !== undefined) {
          s.proposedStake = action.raiseTo;
          s.proposer = action.player;
          events.push({
            type: 'RAISE_PROPOSED',
            player: action.player,
            from: s.currentStake,
            to: action.raiseTo,
          });
        }
        // 후공 차례로 (§12)
        s.phase = 'FOLLOWER_PLAY';
        s.turn = otherPlayer(action.player);
      } else {
        // 후공이 카드를 냈다.
        if (s.proposedStake !== null) {
          // 걸린 인상에 대해 응답해야 한다. (§15)
          s.phase = 'BETTING';
          s.turn = action.player; // 후공이 응답자
        } else {
          // 인상 없음 → 즉시 공개 (§19)
          revealTrick(s, events);
        }
      }
      return { state: s, events };
    }

    // ── 인상 응답: 수락 / 재인상 / 포기 (§15, §16, §17) ──
    case 'RESPOND_RAISE': {
      if (s.phase !== 'BETTING' || action.player !== s.turn) {
        return err(prev, '지금은 인상에 응답할 수 없습니다.');
      }
      if (s.proposedStake === null || s.proposer === null) {
        return err(prev, '응답할 인상 제안이 없습니다.');
      }
      // 연속 인상 금지: 제안자는 자신의 제안에 스스로 응답할 수 없다. (§16)
      if (action.player === s.proposer) {
        return err(prev, '자신의 제안에는 응답할 수 없습니다.');
      }

      if (action.response === 'accept') {
        // 제안 승점이 확정된다. (§15①)
        s.currentStake = s.proposedStake;
        s.proposedStake = null;
        s.proposer = null;
        events.push({ type: 'RAISE_ACCEPTED', player: action.player, stake: s.currentStake });
        revealTrick(s, events);
        return { state: s, events };
      }

      if (action.response === 'reRaise') {
        // 기존 제안을 수락하면서 더 높게 재인상. (§15②)
        const vErr = validateRaise(s.proposedStake, roundMaxStake(s.scores), action.raiseTo);
        if (vErr) return err(prev, vErr);
        const acceptedStake = s.proposedStake;
        s.currentStake = acceptedStake; // 기존 제안 확정
        s.proposedStake = action.raiseTo!;
        s.proposer = action.player;
        events.push({ type: 'RAISE_ACCEPTED', player: action.player, stake: acceptedStake });
        events.push({
          type: 'RAISE_PROPOSED',
          player: action.player,
          from: acceptedStake,
          to: action.raiseTo!,
        });
        s.turn = otherPlayer(action.player); // 번갈아 진행 (§16)
        return { state: s, events };
      }

      // forfeit: 제안을 거절하고 포기. 제안자는 제안 직전 확정 승점을 획득. (§17)
      const winnerP = s.proposer;
      events.push({
        type: 'FORFEITED',
        player: action.player,
        winner: winnerP,
        stake: s.currentStake,
      });
      endRound(s, events, winnerP, 'forfeit');
      return { state: s, events };
    }

    // ── 일반 포기 (인상 상황이 아니어도 자기 차례에 가능) (§18) ──
    case 'FORFEIT': {
      const canForfeit =
        (s.phase === 'LEADER_PLAY' || s.phase === 'FOLLOWER_PLAY' || s.phase === 'BETTING') &&
        action.player === s.turn;
      if (!canForfeit) return err(prev, '지금은 포기할 수 없습니다.');

      const winnerP = otherPlayer(action.player);
      events.push({
        type: 'FORFEITED',
        player: action.player,
        winner: winnerP,
        stake: s.currentStake,
      });
      endRound(s, events, winnerP, 'forfeit');
      return { state: s, events };
    }

    // ── 공개/라운드 결과 확인 후 진행 (서버가 자동 발행) ──
    case 'PROCEED': {
      if (s.phase === 'TRICK_REVEAL') {
        const outcome = evaluateRound(s.trickWins, s.trickHistory);
        if (outcome !== null) {
          endRound(s, events, outcome.winner, outcome.reason);
        } else {
          // 다음 승부 준비. 선공은 직전 승부 승자(무승부면 직전 선공자). (§13, §20)
          const leader = nextLeader(s.lastTrickResult!);
          s.currentTrick = { index: s.trickHistory.length, leader, committed: [null, null] };
          s.lastTrickResult = null;
          s.phase = 'LEADER_PLAY';
          s.turn = leader;
        }
        return { state: s, events };
      }
      // ROUND_OVER 에서의 PROCEED 는 서버가 START_ROUND 로 처리하므로 여기서는 무시.
      return err(prev, '지금은 진행할 수 없습니다.');
    }

    default: {
      const _exhaustive: never = action;
      return err(prev, `알 수 없는 액션: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export { MIN_STAKE, MAX_STAKE, TARGET_SCORE };
