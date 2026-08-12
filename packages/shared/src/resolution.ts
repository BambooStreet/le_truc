// rule.md §20~§23 — 승부/라운드 판정 로직.
import { compareCards, type Card } from './cards.js';
import { MAX_STAKE, MIN_STAKE, TARGET_SCORE } from './types.js';
import type { PlayerId, TrickResult, RoundEndReason } from './types.js';

export const otherPlayer = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/**
 * 현재 점수 기준 "유효 최대 승점"(점수 기반 상한). (rule.md §6, §8)
 * = 12 − (두 점수 중 더 낮은 점수).
 * 이 값을 넘겨 인상해도 어느 쪽이 이기든 승리 시 누적 12점 이상이 확정되어
 * 승패에 변화가 없으므로 상한으로 둔다. (예: 점수 7:6 → 유효 최대 6점)
 */
export function roundMaxStake(scores: [number, number]): number {
  const need = TARGET_SCORE - Math.min(scores[0], scores[1]);
  return Math.max(MIN_STAKE, Math.min(MAX_STAKE, need));
}

/**
 * 승부 결과 판정. (rule.md §20)
 * @returns 이긴 플레이어, 또는 무승부면 null
 */
export function resolveTrickWinner(
  leaderCard: Card,
  followerCard: Card,
  leader: PlayerId,
): PlayerId | null {
  const follower = otherPlayer(leader);
  const cmp = compareCards(leaderCard, followerCard);
  if (cmp === 1) return leader;
  if (cmp === -1) return follower;
  return null; // 같은 숫자 → 무승부
}

/**
 * 다음 승부의 선공자 결정. (rule.md §13, §20)
 * - 직전 승부 승자가 선공.
 * - 무승부면 직전 승부의 선공자가 계속 선공.
 */
export function nextLeader(prev: TrickResult): PlayerId {
  return prev.winner ?? prev.leader;
}

export interface RoundOutcome {
  winner: PlayerId | null; // null = 무효 라운드
  reason: RoundEndReason;
}

/**
 * 승부가 한 번 끝날 때마다 라운드 종료 여부를 판정한다.
 *
 * - 누군가 2승 → 즉시 종료 (rule.md §21)
 * - 3승부 모두 종료 → §22, §23 기준으로 판정
 * - 그 외 → 아직 라운드 진행 중(null 반환)
 */
export function evaluateRound(
  trickWins: [number, number],
  trickHistory: TrickResult[],
): RoundOutcome | null {
  // 2승 달성 시 즉시 라운드 승리 (§21)
  if (trickWins[0] >= 2) return { winner: 0, reason: 'twoWins' };
  if (trickWins[1] >= 2) return { winner: 1, reason: 'twoWins' };

  // 아직 3승부를 다 치르지 않았으면 계속 진행
  if (trickHistory.length < 3) return null;

  // 3승부 종료 후 판정 (§22, §23)
  const firstDecisive = trickHistory.find((t) => t.winner !== null);

  if (trickWins[0] === trickWins[1]) {
    if (trickWins[0] === 0) {
      // 세 번 모두 무승부 → 무효 라운드 (§23)
      return { winner: null, reason: 'void' };
    }
    // 1승 1패 1무 → 먼저 승리한 플레이어 (§22)
    return { winner: firstDecisive!.winner, reason: 'tiebreak' };
  }

  // 1승 2무 → 승리를 기록한 플레이어 (§22)
  return {
    winner: trickWins[0] > trickWins[1] ? 0 : 1,
    reason: 'tiebreak',
  };
}
