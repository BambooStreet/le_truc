// 클라이언트 ↔ 서버 WebSocket 메시지 프로토콜.
// 서버 권위 구조: 클라이언트는 player 를 지정하지 않는다. 서버가 연결에 귀속된 playerId 를 주입한다.
import type { GameEvent, PlayerId, PublicGameState } from './types.js';

/** 주고받을 수 있는 감정 표현 프리셋. 서버가 이 목록으로 검증한다(임의 문자열 방지). */
export const EMOTES = ['👍', '😎', '😂', '😮', '😢', '😡', '🔥', '🤔'] as const;
export type Emote = (typeof EMOTES)[number];

/** 클라이언트가 보낼 수 있는 행동(플레이어 식별자 없음 — 서버가 주입). */
export type ClientAction =
  | { type: 'REQUEST_REDISTRIBUTION' }
  | { type: 'DECLINE_REDISTRIBUTION' }
  | { type: 'RESPOND_REDISTRIBUTION'; accept: boolean }
  | { type: 'PLAY_CARD'; cardId: string; raiseTo?: number }
  | { type: 'RESPOND_RAISE'; response: 'accept' | 'reRaise' | 'forfeit'; raiseTo?: number }
  | { type: 'FORFEIT' };

/** 클라이언트 → 서버 */
export type ClientMessage =
  | { kind: 'create'; name?: string }
  | { kind: 'join'; roomCode: string; name?: string }
  | { kind: 'action'; action: ClientAction }
  | { kind: 'emote'; emote: string };

/** 서버 → 클라이언트 */
export type ServerMessage =
  | { kind: 'joined'; roomCode: string; playerId: PlayerId }
  | { kind: 'waiting' } // 상대 대기 중
  | { kind: 'state'; state: PublicGameState; events: GameEvent[] }
  | { kind: 'emote'; from: PlayerId; emote: string }
  | { kind: 'opponentLeft' }
  | { kind: 'error'; message: string };
