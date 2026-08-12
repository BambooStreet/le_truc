// 서버 권위 구조의 핵심: 각 플레이어 시점에 맞게 상태를 가린다.
// 상대의 손패, 그리고 공개 전(뒷면)으로 제출된 카드는 절대 내려보내지 않는다.
import type { GameState, PlayerId, PublicGameState } from './types.js';
import { getAvailableActions } from './availableActions.js';
import { otherPlayer } from './resolution.js';

export function redactStateFor(s: GameState, you: PlayerId): PublicGameState {
  const opp = otherPlayer(you);

  // 진행 중 승부의 커밋 여부(값은 감춘다).
  const committed: [boolean, boolean] = [
    s.currentTrick?.committed[0] != null,
    s.currentTrick?.committed[1] != null,
  ];

  // 카드 공개는 TRICK_REVEAL 단계에서만. 그 외에는 상대 제출 카드 값을 노출하지 않는다. (§19)
  const revealedTrick = s.phase === 'TRICK_REVEAL' ? s.lastTrickResult : null;

  return {
    phase: s.phase,
    you,
    scores: [s.scores[0], s.scores[1]],
    dealer: s.dealer,
    roundNumber: s.roundNumber,

    yourHand: [...s.hands[you]],
    opponentHandCount: s.hands[opp].length,
    deckCount: s.deck.length,

    currentStake: s.currentStake,
    proposedStake: s.proposedStake,
    proposer: s.proposer,
    redistributionRequested: s.redistributionRequested,

    trickWins: [s.trickWins[0], s.trickWins[1]],
    trickHistory: s.trickHistory.map((t) => ({ ...t, cards: [t.cards[0], t.cards[1]] })),

    committed,
    yourCommitted: s.currentTrick?.committed[you] ?? null,
    revealedTrick,

    turn: s.turn,
    lastRoundResult: s.lastRoundResult,
    winner: s.winner,

    availableActions: getAvailableActions(s, you),
  };
}
