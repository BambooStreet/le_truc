// 테스트용 헬퍼. rule.md 예시를 결정적으로 재현하기 위해 특정 손패가 나오도록 덱을 구성한다.
import { createDeck, type Card } from './cards.js';
import { applyAction } from './engine.js';
import type { Action, GameState, PlayerId } from './types.js';

const BY_ID = new Map(createDeck().map((c) => [c.id, c]));

export function card(id: string): Card {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`알 수 없는 카드 id: ${id}`);
  return c;
}

/**
 * 원하는 손패가 배분되도록 32장 덱을 구성한다.
 * 배분 순서(§10): 비딜러, 딜러, 비딜러, 딜러, 비딜러, 딜러.
 */
export function craftDeck(opts: {
  dealer: PlayerId;
  nonDealer: string[]; // 비딜러 초기 3장
  dealerHand: string[]; // 딜러 초기 3장
  redNonDealer?: string[]; // 재분배 시 비딜러 3장
  redDealer?: string[]; // 재분배 시 딜러 3장
}): Card[] {
  const front: string[] = [];
  for (let n = 0; n < 3; n++) {
    front.push(opts.nonDealer[n], opts.dealerHand[n]);
  }
  if (opts.redNonDealer && opts.redDealer) {
    for (let n = 0; n < 3; n++) {
      front.push(opts.redNonDealer[n], opts.redDealer[n]);
    }
  }
  const used = new Set(front);
  const rest = createDeck()
    .map((c) => c.id)
    .filter((id) => !used.has(id));
  return [...front, ...rest].map(card);
}

/** 액션을 적용하고 오류가 없어야 함을 보장한다. */
export function play(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (r.error) throw new Error(`예상치 못한 오류: ${r.error} (액션: ${action.type})`);
  return r.state;
}

/** 인상 없이 한 승부를 진행하고 공개까지 마친다(다음 승부/라운드 준비 상태로 반환). */
export function playPlainTrick(state: GameState, leaderCardId: string, followerCardId: string): GameState {
  const leader = state.turn as PlayerId;
  const follower = (leader === 0 ? 1 : 0) as PlayerId;
  let s = play(state, { type: 'PLAY_CARD', player: leader, cardId: leaderCardId });
  s = play(s, { type: 'PLAY_CARD', player: follower, cardId: followerCardId });
  s = play(s, { type: 'PROCEED', player: leader });
  return s;
}
