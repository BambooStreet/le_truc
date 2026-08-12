// 방 하나의 권위적 게임 상태를 보유하고, 액션 적용·시점별 브로드캐스트·자동 진행을 담당한다.
import type { WebSocket } from 'ws';
import {
  applyAction,
  createDeck,
  EMOTES,
  initGame,
  redactStateFor,
  shuffle,
  type Action,
  type ClientAction,
  type Emote,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ServerMessage,
} from '@le-truc/shared';

const REVEAL_DELAY_MS = 2600; // 카드 공개를 양쪽이 볼 시간
const ROUND_GAP_MS = 3600; // 라운드 결과 표시 후 다음 라운드까지

interface Seat {
  ws: WebSocket | null;
  connected: boolean;
}

export class GameRoom {
  readonly code: string;
  private seats: [Seat, Seat] = [
    { ws: null, connected: false },
    { ws: null, connected: false },
  ];
  private state: GameState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastEmoteAt: [number, number] = [0, 0];

  constructor(code: string) {
    this.code = code;
  }

  get isFull(): boolean {
    return this.seats[0].ws !== null && this.seats[1].ws !== null;
  }

  get isEmpty(): boolean {
    return !this.seats[0].connected && !this.seats[1].connected;
  }

  /** 빈 자리에 플레이어를 앉힌다. 자리가 없으면 null. */
  addPlayer(ws: WebSocket): PlayerId | null {
    const slot = this.seats[0].ws === null ? 0 : this.seats[1].ws === null ? 1 : null;
    if (slot === null) return null;
    this.seats[slot] = { ws, connected: true };
    return slot as PlayerId;
  }

  /** 2명이 모두 앉으면 게임을 시작한다. (rule.md §9, §10) */
  start(): void {
    const firstDealer: PlayerId = Math.random() < 0.5 ? 0 : 1; // 무작위 첫 딜러 (§9)
    const base = initGame(firstDealer);
    const res = applyAction(base, { type: 'START_ROUND', deck: shuffle(createDeck()) });
    this.state = res.state;
    this.broadcastState(res.events);
    this.scheduleAuto();
  }

  /** 클라이언트 행동을 엔진에 적용한다. player 는 서버가 연결로부터 주입한다(권위 검증). */
  handleAction(player: PlayerId, action: ClientAction): void {
    if (!this.state) return;
    const engineAction = this.toEngineAction(player, action);
    const res = applyAction(this.state, engineAction);
    if (res.error) {
      this.send(player, { kind: 'error', message: res.error });
      return;
    }
    this.state = res.state;
    this.broadcastState(res.events);
    this.scheduleAuto();
  }

  /** 감정 표현을 양쪽에 릴레이한다(게임 상태와 무관, 단순 전달). 가벼운 스팸 방지 포함. */
  handleEmote(player: PlayerId, emote: string): void {
    if (!EMOTES.includes(emote as Emote)) return; // 허용된 프리셋만
    const now = Date.now();
    if (now - this.lastEmoteAt[player] < 600) return; // 0.6초 쓰로틀
    this.lastEmoteAt[player] = now;
    const msg: ServerMessage = { kind: 'emote', from: player, emote };
    this.rawSend(0, msg);
    this.rawSend(1, msg);
  }

  handleDisconnect(player: PlayerId): void {
    this.seats[player] = { ws: null, connected: false };
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const other = player === 0 ? 1 : 0;
    this.rawSend(other as PlayerId, { kind: 'opponentLeft' });
  }

  // ── 내부 ──

  private toEngineAction(player: PlayerId, a: ClientAction): Action {
    switch (a.type) {
      case 'REQUEST_REDISTRIBUTION':
        return { type: 'REQUEST_REDISTRIBUTION', player };
      case 'DECLINE_REDISTRIBUTION':
        return { type: 'DECLINE_REDISTRIBUTION', player };
      case 'RESPOND_REDISTRIBUTION':
        return { type: 'RESPOND_REDISTRIBUTION', player, accept: a.accept };
      case 'PLAY_CARD':
        return { type: 'PLAY_CARD', player, cardId: a.cardId, raiseTo: a.raiseTo };
      case 'RESPOND_RAISE':
        return { type: 'RESPOND_RAISE', player, response: a.response, raiseTo: a.raiseTo };
      case 'FORFEIT':
        return { type: 'FORFEIT', player };
    }
  }

  /** 공개/라운드 종료 단계에서 서버가 다음 단계로 자동 진행한다(엔진은 순수 유지). */
  private scheduleAuto(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.state) return;

    if (this.state.phase === 'TRICK_REVEAL') {
      this.timer = setTimeout(() => this.autoApply({ type: 'PROCEED', player: 0 }), REVEAL_DELAY_MS);
    } else if (this.state.phase === 'ROUND_OVER') {
      this.timer = setTimeout(
        () => this.autoApply({ type: 'START_ROUND', deck: shuffle(createDeck()) }),
        ROUND_GAP_MS,
      );
    }
  }

  private autoApply(action: Action): void {
    if (!this.state) return;
    const res = applyAction(this.state, action);
    if (res.error) return;
    this.state = res.state;
    this.broadcastState(res.events);
    this.scheduleAuto();
  }

  private broadcastState(events: GameEvent[]): void {
    if (!this.state) return;
    for (const p of [0, 1] as PlayerId[]) {
      const seat = this.seats[p];
      if (!seat.ws) continue;
      const msg: ServerMessage = {
        kind: 'state',
        state: redactStateFor(this.state, p), // 시점별로 가려진 상태만 전송
        events,
      };
      this.safeSend(seat.ws, msg);
    }
  }

  private send(player: PlayerId, msg: ServerMessage): void {
    this.rawSend(player, msg);
  }

  private rawSend(player: PlayerId, msg: ServerMessage): void {
    const ws = this.seats[player]?.ws;
    if (ws) this.safeSend(ws, msg);
  }

  private safeSend(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // 전송 실패는 무시(연결 종료 등)
    }
  }
}
