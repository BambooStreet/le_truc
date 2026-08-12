import { describe, it, expect } from 'vitest';
import { compareCards, createDeck } from './cards.js';
import { card } from './testHelpers.js';

describe('카드 구성 (rule.md §2)', () => {
  it('덱은 32장이다', () => {
    expect(createDeck()).toHaveLength(32);
  });

  it('각 랭크는 4장(문양별 1장)씩 존재한다', () => {
    const deck = createDeck();
    for (const rank of ['7', '8', 'A', 'K', 'Q', 'J', '10', '9']) {
      expect(deck.filter((c) => c.rank === rank)).toHaveLength(4);
    }
  });
});

describe('카드 서열 (rule.md §3)', () => {
  it('7 > 8 > A > K > Q > J > 10 > 9 순서를 따른다', () => {
    expect(compareCards(card('7C'), card('8H'))).toBe(1); // 7♣ vs 8♥ → 7 승
    expect(compareCards(card('8S'), card('AD'))).toBe(1); // 8♠ vs A♦ → 8 승
    expect(compareCards(card('AH'), card('KC'))).toBe(1); // A♥ vs K♣ → A 승
    expect(compareCards(card('QC'), card('JS'))).toBe(1); // Q♣ vs J♠ → Q 승
    expect(compareCards(card('JC'), card('10C'))).toBe(1);
    expect(compareCards(card('10C'), card('9C'))).toBe(1);
  });

  it('같은 숫자는 문양과 무관하게 무승부', () => {
    expect(compareCards(card('KS'), card('KH'))).toBe(0); // K♠ vs K♥ → 무승부
  });

  it('문양은 승패에 영향을 주지 않는다', () => {
    expect(compareCards(card('7C'), card('7D'))).toBe(0);
    expect(compareCards(card('9S'), card('9H'))).toBe(0);
  });
});
