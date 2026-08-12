import { describe, it, expect } from 'vitest';
import { applyAction, initGame } from './engine.js';
import { getAvailableActions } from './availableActions.js';
import type { GameState, PlayerId } from './types.js';
import { craftDeck, play, playPlainTrick } from './testHelpers.js';

/** 라운드 시작 직후(재분배 결정 대기) 상태를 만든다. */
function startedRound(opts: {
  dealer: PlayerId;
  nonDealer: string[];
  dealerHand: string[];
  scores?: [number, number];
  redNonDealer?: string[];
  redDealer?: string[];
}): GameState {
  let s = initGame(opts.dealer);
  if (opts.scores) s = { ...s, scores: [...opts.scores] };
  const deck = craftDeck(opts);
  return play(s, { type: 'START_ROUND', deck });
}

/** 재분배를 거절(진행)하고 첫 승부(LEADER_PLAY) 상태로 만든다. */
function toFirstTrick(s: GameState): GameState {
  return play(s, { type: 'DECLINE_REDISTRIBUTION', player: s.turn as PlayerId });
}

describe('카드 배분과 선공 (rule.md §10, §13)', () => {
  it('비딜러가 3장, 딜러가 3장 받고 비딜러가 첫 선공', () => {
    const s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['AC', 'KC', 'QC'] });
    expect(s.hands[0].map((c) => c.id).sort()).toEqual(['7C', '8C', '9C']);
    expect(s.hands[1].map((c) => c.id).sort()).toEqual(['AC', 'KC', 'QC']);
    expect(s.deck).toHaveLength(26);
    const t = toFirstTrick(s);
    expect(t.phase).toBe('LEADER_PLAY');
    expect(t.turn).toBe(0); // 비딜러(=0)가 선공
  });
});

describe('2승 라운드 승리 (rule.md §21)', () => {
  it('선공이 1·2 승부를 이기면 3승부 없이 라운드 승리', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = playPlainTrick(s, '7C', '9H'); // 트릭1: 0 승 (7 > 9)
    expect(s.trickWins).toEqual([1, 0]);
    s = playPlainTrick(s, '8C', '9D'); // 트릭2: 0 승 (8 > 9)
    expect(s.phase).toBe('ROUND_OVER');
    expect(s.trickHistory).toHaveLength(2); // 3승부는 진행되지 않음
    expect(s.lastRoundResult).toMatchObject({ winner: 0, stakeAwarded: 1, reason: 'twoWins' });
    expect(s.scores[0]).toBe(1);
  });
});

describe('승점 인상 규칙 (rule.md §7, §8)', () => {
  it('현재 확정 승점보다 크고 12 이하만 제안 가능', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s); // currentStake = 1, leader = 0

    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 1 }).error).toBeTruthy();
    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 13 }).error).toBeTruthy();
    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 12 }).error).toBeFalsy();
  });

  it('후공은 인상을 개시할 수 없다 (확정 해석 1)', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C' }); // 리더 유지
    // 후공이 raiseTo 를 시도하면 거부된다.
    expect(applyAction(s, { type: 'PLAY_CARD', player: 1, cardId: '9H', raiseTo: 3 }).error).toBeTruthy();
  });

  it('12점 확정 후에는 인상 불가, 유지/포기만 가능 (§8, §25)', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 12 });
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' }); // 후공 카드 → BETTING
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'accept' }); // 12 확정
    // 트릭 공개 후 다음 트릭에서 인상 불가 확인
    s = play(s, { type: 'PROCEED', player: 0 });
    const acts = getAvailableActions(s, s.turn as PlayerId);
    const playCard = acts.find((a) => a.type === 'PLAY_CARD');
    expect(playCard).toMatchObject({ canRaise: false });
  });
});

describe('점수 기반 유효 최대 승점 (rule.md §6, §8)', () => {
  it('7:6 상황에서는 6점까지만 인상 가능(그 이상은 승패에 무의미)', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'], scores: [7, 6] });
    s = toFirstTrick(s); // leader = 0, currentStake 1

    const playAct = getAvailableActions(s, 0).find((a) => a.type === 'PLAY_CARD');
    expect(playAct).toMatchObject({ canRaise: true, raiseMin: 2, raiseMax: 6 });

    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 6 }).error).toBeFalsy();
    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 7 }).error).toBeTruthy();
  });

  it('유효 최대(6)까지 올린 뒤에는 재인상 불가(수락/포기만)', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'], scores: [7, 6] });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 6 }); // 유효 최대 제안
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' }); // 후공 카드 → BETTING
    const respondAct = getAvailableActions(s, 1).find((a) => a.type === 'RESPOND_RAISE');
    expect(respondAct).toMatchObject({ canReRaise: false });
    expect(applyAction(s, { type: 'RESPOND_RAISE', player: 1, response: 'reRaise', raiseTo: 7 }).error).toBeTruthy();
  });

  it('11:11 상황에서는 유효 최대가 1점이라 인상 자체가 불가', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'], scores: [11, 11] });
    s = toFirstTrick(s);
    const playAct = getAvailableActions(s, 0).find((a) => a.type === 'PLAY_CARD');
    expect(playAct).toMatchObject({ canRaise: false });
    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 2 }).error).toBeTruthy();
  });

  it('0:0 상황에서는 유효 최대가 12점(기존과 동일)', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'], scores: [0, 0] });
    s = toFirstTrick(s);
    const playAct = getAvailableActions(s, 0).find((a) => a.type === 'PLAY_CARD');
    expect(playAct).toMatchObject({ canRaise: true, raiseMax: 12 });
  });
});

describe('연속 인상 금지 (rule.md §16)', () => {
  it('상대 대응 없이 같은 플레이어가 연속으로 인상할 수 없다', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 3 });
    // 리더(0)가 다시 행동하려 하면 자기 차례가 아니라 거부된다.
    expect(applyAction(s, { type: 'PLAY_CARD', player: 0, cardId: '8C', raiseTo: 7 }).error).toBeTruthy();
    expect(s.turn).toBe(1); // 후공 응답 차례
  });
});

describe('재인상 흐름 (rule.md §15②)', () => {
  it('B가 재인상하면 A의 제안이 확정되고 새 제안이 걸린다', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 5 }); // A: 5 제안
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' }); // B 카드 커밋
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'reRaise', raiseTo: 8 }); // B: 8 재인상
    expect(s.currentStake).toBe(5); // A의 5 확정
    expect(s.proposedStake).toBe(8);
    expect(s.proposer).toBe(1);
    expect(s.turn).toBe(0); // A 응답 차례
  });
});

describe('포기 정산 (rule.md §17)', () => {
  function raiseThenState(current: number, raiseTo: number) {
    // current 를 만들기 위해 필요한 만큼 인상을 누적하는 대신, 첫 트릭에서 바로 구성.
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'], scores: [0, 0] });
    s = toFirstTrick(s); // currentStake = 1
    if (current > 1) {
      // 리더(0) 제안 → 후공(1) 수락으로 currentStake 를 current 로 만든다.
      s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: current });
      s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' });
      s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'accept' });
      s = play(s, { type: 'PROCEED', player: 0 }); // 트릭1 공개 후 다음 트릭
      // 트릭1은 7 > 9 로 0이 승리 → 다음 트릭 리더 = 0
      s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '8C', raiseTo: raiseTo });
      s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9D' });
      return s; // BETTING, 후공(1)이 응답 차례
    }
    // current === 1 인 단순 케이스
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo });
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' });
    return s;
  }

  it('예시1: 확정 1점에서 7점 제안 → 포기 시 제안자 1점 획득', () => {
    let s = raiseThenState(1, 7);
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'forfeit' });
    expect(s.lastRoundResult).toMatchObject({ winner: 0, stakeAwarded: 1, reason: 'forfeit' });
    expect(s.scores[0]).toBe(1);
  });

  it('예시2: 확정 5점에서 9점 제안 → 포기 시 제안자 5점 획득', () => {
    let s = raiseThenState(5, 9);
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'forfeit' });
    expect(s.lastRoundResult).toMatchObject({ winner: 0, stakeAwarded: 5, reason: 'forfeit' });
    expect(s.scores[0]).toBe(5);
  });

  it('예시3: 확정 8점에서 12점 제안 → 포기 시 제안자 8점 획득', () => {
    let s = raiseThenState(8, 12);
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'forfeit' });
    expect(s.lastRoundResult).toMatchObject({ winner: 0, stakeAwarded: 8, reason: 'forfeit' });
    expect(s.scores[0]).toBe(8);
  });
});

describe('일반 포기 (rule.md §18)', () => {
  it('인상이 없어도 자기 차례에 포기하면 상대가 현재 확정 승점 획득', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '8C', '9C'], dealerHand: ['9H', '9D', 'QC'] });
    s = toFirstTrick(s);
    s = play(s, { type: 'FORFEIT', player: 0 }); // 리더가 즉시 포기
    expect(s.lastRoundResult).toMatchObject({ winner: 1, stakeAwarded: 1, reason: 'forfeit' });
    expect(s.scores[1]).toBe(1);
  });
});

describe('3승부 후 판정 (rule.md §22)', () => {
  it('1승 1패 1무 → 먼저 승리한 플레이어 승리', () => {
    // 트릭1: 0승, 트릭2: 1승, 트릭3: 무 → 0 승리(먼저 승리)
    let s = startedRound({ dealer: 1, nonDealer: ['7C', '9C', 'KC'], dealerHand: ['9H', '7H', 'KH'] });
    s = toFirstTrick(s);
    s = playPlainTrick(s, '7C', '9H'); // 0 승 (7>9)
    // 트릭2 리더 = 0. 0이 9C, 1이 7H → 1 승 (7>9)
    s = playPlainTrick(s, '9C', '7H');
    // 트릭3 리더 = 1. 1이 KH, 0이 KC → 무
    s = playPlainTrick(s, 'KH', 'KC');
    expect(s.trickWins).toEqual([1, 1]);
    expect(s.lastRoundResult).toMatchObject({ winner: 0, reason: 'tiebreak' });
  });

  it('1승 2무 → 승리를 기록한 플레이어 승리', () => {
    // 트릭1: 무, 트릭2: 무, 트릭3: 0승 → 0 승리
    let s = startedRound({ dealer: 1, nonDealer: ['KC', 'QC', '7C'], dealerHand: ['KH', 'QH', '9H'] });
    s = toFirstTrick(s);
    s = playPlainTrick(s, 'KC', 'KH'); // 무
    // 트릭2 리더 = 직전 선공자(0) 유지
    s = playPlainTrick(s, 'QC', 'QH'); // 무
    s = playPlainTrick(s, '7C', '9H'); // 0 승
    expect(s.trickWins).toEqual([1, 0]);
    expect(s.lastRoundResult).toMatchObject({ winner: 0, reason: 'tiebreak' });
  });
});

describe('세 번 모두 무승부 (rule.md §23)', () => {
  it('무효 라운드 — 아무도 승점 없음, 다음 라운드 승점 1·딜러 교대', () => {
    let s = startedRound({ dealer: 1, nonDealer: ['KC', 'QC', 'JC'], dealerHand: ['KH', 'QH', 'JH'] });
    s = toFirstTrick(s);
    s = playPlainTrick(s, 'KC', 'KH');
    s = playPlainTrick(s, 'QC', 'QH');
    s = playPlainTrick(s, 'JC', 'JH');
    expect(s.lastRoundResult).toMatchObject({ winner: null, stakeAwarded: 0, reason: 'void' });
    expect(s.scores).toEqual([0, 0]);
    expect(s.phase).toBe('ROUND_OVER');

    // 다음 라운드
    const next = play(s, {
      type: 'START_ROUND',
      deck: craftDeck({ dealer: 0, nonDealer: ['7C', '8C', '9C'], dealerHand: ['AC', 'KC', 'QC'] }),
    });
    expect(next.currentStake).toBe(1); // 승점 초기화
    expect(next.dealer).toBe(0); // 딜러 교대 (직전 1 → 0)
    expect(next.roundNumber).toBe(2);
  });
});

describe('게임 종료 (rule.md §4, §26)', () => {
  it('누적 12점 이상이면 즉시 게임 종료 (8 + 7 = 15)', () => {
    // A(0) 8점 보유, 7점짜리 라운드 승리 → 15점 → 게임 승리
    let s = startedRound({
      dealer: 1,
      nonDealer: ['7C', '8C', 'AC'],
      dealerHand: ['9H', '9D', '9S'],
      scores: [8, 0],
    });
    s = toFirstTrick(s);
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C', raiseTo: 7 });
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' });
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'accept' }); // 7 확정
    s = play(s, { type: 'PROCEED', player: 0 }); // 트릭1: 0승
    s = playPlainTrick(s, '8C', '9D'); // 트릭2: 0승 → 2승 라운드 종료
    expect(s.scores[0]).toBe(15);
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winner).toBe(0);
  });
});
