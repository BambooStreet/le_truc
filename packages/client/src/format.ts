// 표시용 순수 포매팅 헬퍼. 규칙 판정은 하지 않는다.
import type { Card, GameEvent, PlayerId } from '@le-truc/shared';

export const SUIT_SYMBOL: Record<string, string> = {
  C: '♣',
  H: '♥',
  S: '♠',
  D: '♦',
};

export const isRed = (c: Card): boolean => c.suit === 'H' || c.suit === 'D';

export function rankLabel(c: Card): string {
  return c.rank; // 7,8,A,K,Q,J,10,9
}

/** 이벤트를 나(you) 시점의 한국어 로그로 변환. */
export function eventText(e: GameEvent, you: PlayerId): string {
  const me = (p: PlayerId) => (p === you ? '나' : '상대');
  switch (e.type) {
    case 'ROUND_STARTED':
      return `— ${e.roundNumber}라운드 시작 (딜러: ${me(e.dealer)}) —`;
    case 'REDISTRIBUTION':
      return e.accepted ? '카드 재분배가 이루어졌습니다.' : '재분배가 거절되었습니다.';
    case 'CARD_PLAYED':
      return `${me(e.player)}가 카드를 제출했습니다.`;
    case 'RAISE_PROPOSED':
      return `${me(e.player)}가 승점을 ${e.from} → ${e.to}점으로 인상 제안.`;
    case 'RAISE_ACCEPTED':
      return `${me(e.player)}가 ${e.stake}점을 수락(확정).`;
    case 'TRICK_REVEALED': {
      const w = e.result.winner;
      const outcome = w === null ? '무승부' : `${me(w)} 승리`;
      return `카드 공개 → ${outcome} (걸린 승점 ${e.currentStake}점)`;
    }
    case 'FORFEITED':
      return `${me(e.player)}가 포기 → ${me(e.winner)}가 ${e.stake}점 획득.`;
    case 'ROUND_ENDED':
      return e.result.winner === null
        ? '무효 라운드 — 승점 없음.'
        : `라운드 종료 → ${me(e.result.winner)}가 ${e.result.stakeAwarded}점 획득.`;
    case 'GAME_OVER':
      return `게임 종료 — ${me(e.winner)}의 최종 승리!`;
  }
}
