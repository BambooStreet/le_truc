// 서버가 각 플레이어에게 "지금 할 수 있는 행동"을 계산해 내려준다.
// 프런트는 이 목록만 보고 UI 를 그린다. 규칙 판정을 프런트에서 재구현하지 않는다.
import { roundMaxStake } from './resolution.js';
import type { AvailableAction, GameState, PlayerId } from './types.js';

export function getAvailableActions(s: GameState, player: PlayerId): AvailableAction[] {
  // 자기 차례가 아니면 아무 행동도 할 수 없다.
  const myTurn = s.turn === player;

  switch (s.phase) {
    case 'REDISTRIBUTION_OFFER':
      return myTurn
        ? [{ type: 'REQUEST_REDISTRIBUTION' }, { type: 'DECLINE_REDISTRIBUTION' }]
        : [];

    case 'REDISTRIBUTION_RESPONSE':
      return myTurn ? [{ type: 'RESPOND_REDISTRIBUTION' }] : [];

    case 'LEADER_PLAY': {
      if (!myTurn) return [];
      const maxStake = roundMaxStake(s.scores); // 점수 기반 유효 최대 승점 (§6, §8)
      const canRaise = s.currentStake < maxStake;
      return [
        {
          type: 'PLAY_CARD',
          canRaise,
          ...(canRaise ? { raiseMin: s.currentStake + 1, raiseMax: maxStake } : {}),
        },
        { type: 'FORFEIT' },
      ];
    }

    case 'FOLLOWER_PLAY':
      // 후공은 인상을 개시할 수 없다. (확정 해석 1)
      return myTurn ? [{ type: 'PLAY_CARD', canRaise: false }, { type: 'FORFEIT' }] : [];

    case 'BETTING': {
      if (!myTurn || s.proposedStake === null) return [];
      const maxStake = roundMaxStake(s.scores); // 점수 기반 유효 최대 승점 (§6, §8)
      const canReRaise = s.proposedStake < maxStake;
      return [
        {
          type: 'RESPOND_RAISE',
          canReRaise,
          ...(canReRaise ? { raiseMin: s.proposedStake + 1, raiseMax: maxStake } : {}),
        },
      ];
    }

    // 서버가 자동으로 진행하는 단계(공개/라운드 결과/게임 종료/덱 대기)에서는 플레이어 행동 없음.
    case 'ROUND_START':
    case 'TRICK_REVEAL':
    case 'ROUND_OVER':
    case 'GAME_OVER':
      return [];
  }
}
