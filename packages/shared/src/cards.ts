// rule.md §2, §3 — 카드 구성 및 서열을 코드로 구현.
// 규칙의 유일한 기준은 rule.md 이다. 이 파일은 그 규칙의 구현물일 뿐이다.

/** 사용하는 8개 랭크. 2~6, 조커는 제외한다. (rule.md §2) */
export type Rank = '7' | '8' | 'A' | 'K' | 'Q' | 'J' | '10' | '9';

/** 문양. 승패에는 영향을 주지 않으나 카드 식별(32장 구분)에 필요하다. (rule.md §2, §3) */
export type Suit = 'C' | 'H' | 'S' | 'D';

export interface Card {
  /** 예: "7C", "10H". 덱 내 고유 식별자. */
  id: string;
  rank: Rank;
  suit: Suit;
}

export const RANKS: readonly Rank[] = ['7', '8', 'A', 'K', 'Q', 'J', '10', '9'];
export const SUITS: readonly Suit[] = ['C', 'H', 'S', 'D'];

/**
 * 카드 강함 수치. 값이 클수록 강하다. (rule.md §3)
 * 강함 ← 7 > 8 > A > K > Q > J > 10 > 9 → 약함
 */
export const RANK_STRENGTH: Record<Rank, number> = {
  '7': 8,
  '8': 7,
  A: 6,
  K: 5,
  Q: 4,
  J: 3,
  '10': 2,
  '9': 1,
};

/** 32장 덱(정렬된 상태)을 생성한다. 셔플은 서버가 담당한다. (rule.md §2, §10) */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, rank, suit });
    }
  }
  return deck;
}

/**
 * 두 카드의 승부를 비교한다. 문양은 무시한다. (rule.md §3, §19, §20)
 * @returns 1  = a가 더 강함
 *          -1 = b가 더 강함
 *          0  = 같은 숫자(무승부)
 */
export function compareCards(a: Card, b: Card): 1 | 0 | -1 {
  const sa = RANK_STRENGTH[a.rank];
  const sb = RANK_STRENGTH[b.rank];
  if (sa > sb) return 1;
  if (sa < sb) return -1;
  return 0;
}
