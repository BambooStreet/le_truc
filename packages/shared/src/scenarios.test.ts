import { describe, it, expect } from 'vitest';
import { applyAction, initGame } from './engine.js';
import { getAvailableActions } from './availableActions.js';
import type { GameState, PlayerId } from './types.js';
import { craftDeck, play } from './testHelpers.js';

describe('재분배 (rule.md §11)', () => {
  function offered(): GameState {
    const s = initGame(1); // 딜러=1, 비딜러=0
    const deck = craftDeck({
      dealer: 1,
      nonDealer: ['9C', '9D', '9S'], // 비딜러 약한 손패
      dealerHand: ['QC', 'QD', 'QH'],
      redNonDealer: ['7C', '8C', 'AC'], // 재분배 후 비딜러 손패
      redDealer: ['KC', 'KD', 'KH'],
    });
    return play(s, { type: 'START_ROUND', deck });
  }

  it('딜러 수락 시 6장 폐기 후 남은 덱에서 다시 3장씩', () => {
    let s = offered();
    s = play(s, { type: 'REQUEST_REDISTRIBUTION', player: 0 });
    expect(s.phase).toBe('REDISTRIBUTION_RESPONSE');
    expect(s.turn).toBe(1); // 딜러가 응답
    s = play(s, { type: 'RESPOND_REDISTRIBUTION', player: 1, accept: true });

    expect(s.hands[0].map((c) => c.id).sort()).toEqual(['7C', '8C', 'AC']);
    expect(s.hands[1].map((c) => c.id).sort()).toEqual(['KC', 'KD', 'KH']);
    expect(s.discarded).toHaveLength(6); // 기존 6장 폐기
    expect(s.deck).toHaveLength(20); // 26 - 6
    expect(s.phase).toBe('LEADER_PLAY');
    expect(s.turn).toBe(0); // 비딜러 선공
  });

  it('딜러 거절 시 기존 손패로 진행', () => {
    let s = offered();
    s = play(s, { type: 'REQUEST_REDISTRIBUTION', player: 0 });
    s = play(s, { type: 'RESPOND_REDISTRIBUTION', player: 1, accept: false });
    expect(s.hands[0].map((c) => c.id).sort()).toEqual(['9C', '9D', '9S']);
    expect(s.discarded).toHaveLength(0);
    expect(s.phase).toBe('LEADER_PLAY');
  });

  it('재분배는 비딜러만 요청할 수 있다', () => {
    const s = offered();
    expect(s.turn).toBe(0); // 비딜러 차례
    // 딜러(1)가 재분배를 요청하면 거부된다.
    expect(applyAction(s, { type: 'REQUEST_REDISTRIBUTION', player: 1 }).error).toBeTruthy();
  });
});

describe('전체 플레이 예시 (rule.md §30, 유효 최대 승점 반영)', () => {
  it('A(0)=4점, B(1)=6점 → 유효 최대 8점 라운드를 A가 이겨 최종 승리', () => {
    // 점수 4:6 → 유효 최대 승점 = 12 − min(4,6) = 8.
    // 딜러=1(B) → 비딜러=0(A)가 트릭1 선공.
    // 트릭1: A 7C vs B 9H → A 승
    // 트릭2: A 9C vs B 7H → B 승 (A:5제안, B:8재인상, A:수락 → 8확정, 유효 최대 도달)
    // 트릭3: B 10H vs A 8C → A 승 (8점이 이미 유효 최대라 추가 인상 불가), A 2승 → 8점 획득
    let s = initGame(1);
    s = { ...s, scores: [4, 6] };
    const deck = craftDeck({
      dealer: 1,
      nonDealer: ['7C', '9C', '8C'], // A
      dealerHand: ['9H', '7H', '10H'], // B
    });
    s = play(s, { type: 'START_ROUND', deck });
    s = play(s, { type: 'DECLINE_REDISTRIBUTION', player: 0 });

    // 트릭1
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '7C' });
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '9H' });
    s = play(s, { type: 'PROCEED', player: 0 });
    expect(s.trickWins).toEqual([1, 0]);
    expect(s.turn).toBe(0); // A가 트릭1 승 → 트릭2 선공

    // 트릭2: A 5 제안, B 8 재인상, A 수락
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '9C', raiseTo: 5 });
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '7H' });
    s = play(s, { type: 'RESPOND_RAISE', player: 1, response: 'reRaise', raiseTo: 8 });
    expect(s.currentStake).toBe(5);
    s = play(s, { type: 'RESPOND_RAISE', player: 0, response: 'accept' });
    expect(s.currentStake).toBe(8);
    s = play(s, { type: 'PROCEED', player: 0 });
    expect(s.trickWins).toEqual([1, 1]);
    expect(s.turn).toBe(1); // B가 트릭2 승 → 트릭3 선공

    // 트릭3: 유효 최대 승점(8)에 이미 도달 → 추가 인상 불가. B는 그대로 카드 제출.
    expect(getAvailableActions(s, 1).find((a) => a.type === 'PLAY_CARD')).toMatchObject({ canRaise: false });
    expect(applyAction(s, { type: 'PLAY_CARD', player: 1, cardId: '10H', raiseTo: 9 }).error).toBeTruthy();
    s = play(s, { type: 'PLAY_CARD', player: 1, cardId: '10H' });
    s = play(s, { type: 'PLAY_CARD', player: 0, cardId: '8C' });
    s = play(s, { type: 'PROCEED', player: 1 as PlayerId });

    expect(s.trickWins).toEqual([2, 1]);
    expect(s.lastRoundResult).toMatchObject({ winner: 0, stakeAwarded: 8, reason: 'twoWins' });
    expect(s.scores[0]).toBe(12); // 4 + 8
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winner).toBe(0);
  });
});

describe('딜러 교대 (rule.md §9)', () => {
  it('라운드마다 딜러가 교대된다', () => {
    let s = initGame(0);
    s = play(s, {
      type: 'START_ROUND',
      deck: craftDeck({ dealer: 0, nonDealer: ['7C', '8C', '9C'], dealerHand: ['AC', 'KC', 'QC'] }),
    });
    expect(s.dealer).toBe(0);
    // 즉시 포기로 라운드 종료 후 다음 라운드
    s = play(s, { type: 'DECLINE_REDISTRIBUTION', player: s.turn as PlayerId });
    s = play(s, { type: 'FORFEIT', player: s.turn as PlayerId });
    s = play(s, {
      type: 'START_ROUND',
      deck: craftDeck({ dealer: 1, nonDealer: ['7D', '8D', '9D'], dealerHand: ['AD', 'KD', 'QD'] }),
    });
    expect(s.dealer).toBe(1); // 교대됨
  });
});
