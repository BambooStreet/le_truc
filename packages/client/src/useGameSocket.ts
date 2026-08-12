// WebSocket 연결 관리 훅. 서버가 내려준 PublicGameState 를 그대로 렌더 소스로 노출한다.
// 게임 규칙은 클라이언트에서 재구현하지 않는다 — availableActions 만 보고 UI 를 구성한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientAction,
  ClientMessage,
  GameEvent,
  PlayerId,
  PublicGameState,
  ServerMessage,
} from '@le-truc/shared';

// 배포 시엔 Vercel 환경변수 VITE_WS_URL 에 Railway 서버 주소(wss://...)를 넣는다.
// 로컬 개발 기본값은 현재 호스트의 8080 포트(https 면 wss).
const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;

export type ConnStatus = 'disconnected' | 'connecting' | 'connected';
export type Screen = 'lobby' | 'waiting' | 'game';

export interface EventLogEntry {
  id: number;
  event: GameEvent;
}

/** 각 플레이어가 마지막으로 보낸 감정 표현(seq 로 재생 트리거). */
export type EmoteState = Partial<Record<PlayerId, { emote: string; seq: number }>>;

export interface GameSocket {
  status: ConnStatus;
  screen: Screen;
  roomCode: string | null;
  playerId: PlayerId | null;
  state: PublicGameState | null;
  events: EventLogEntry[];
  emotes: EmoteState;
  error: string | null;
  opponentLeft: boolean;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  sendAction: (action: ClientAction) => void;
  sendEmote: (emote: string) => void;
  clearError: () => void;
}

export function useGameSocket(): GameSocket {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [screen, setScreen] = useState<Screen>('lobby');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [state, setState] = useState<PublicGameState | null>(null);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [emotes, setEmotes] = useState<EmoteState>({});
  const eventId = useRef(0);
  const emoteSeq = useRef(0);

  const ensureSocket = useCallback((): Promise<WebSocket> => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return Promise.resolve(wsRef.current);
    }
    return new Promise((resolve, reject) => {
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus('connected');
        resolve(ws);
      };
      ws.onerror = () => {
        setStatus('disconnected');
        reject(new Error('서버에 연결할 수 없습니다.'));
      };
      ws.onclose = () => setStatus('disconnected');
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        handleServerMessage(msg);
      };
    });
  }, []);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.kind) {
      case 'joined':
        setRoomCode(msg.roomCode);
        setPlayerId(msg.playerId);
        break;
      case 'waiting':
        setScreen('waiting');
        break;
      case 'state':
        setScreen('game');
        setState(msg.state);
        setOpponentLeft(false);
        if (msg.events.length) {
          setEvents((prev) => {
            const added = msg.events.map((e) => ({ id: eventId.current++, event: e }));
            return [...prev, ...added].slice(-40);
          });
        }
        break;
      case 'emote':
        setEmotes((prev) => ({
          ...prev,
          [msg.from]: { emote: msg.emote, seq: (emoteSeq.current += 1) },
        }));
        break;
      case 'opponentLeft':
        setOpponentLeft(true);
        break;
      case 'error':
        setError(msg.message);
        break;
    }
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const createRoom = useCallback(() => {
    setError(null);
    ensureSocket()
      .then(() => send({ kind: 'create' }))
      .catch((e) => setError((e as Error).message));
  }, [ensureSocket, send]);

  const joinRoom = useCallback(
    (code: string) => {
      setError(null);
      ensureSocket()
        .then(() => send({ kind: 'join', roomCode: code.trim().toUpperCase() }))
        .catch((e) => setError((e as Error).message));
    },
    [ensureSocket, send],
  );

  const sendAction = useCallback(
    (action: ClientAction) => {
      send({ kind: 'action', action });
    },
    [send],
  );

  const sendEmote = useCallback(
    (emote: string) => {
      send({ kind: 'emote', emote });
    },
    [send],
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  return {
    status,
    screen,
    roomCode,
    playerId,
    state,
    events,
    emotes,
    error,
    opponentLeft,
    createRoom,
    joinRoom,
    sendAction,
    sendEmote,
    clearError,
  };
}
