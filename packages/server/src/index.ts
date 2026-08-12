// Le Truc 게임 WebSocket 서버. 방 코드 기반 매칭 + 서버 권위 게임 진행.
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, PlayerId, ServerMessage } from '@le-truc/shared';
import { GameRoom } from './room.js';

// 호스팅 플랫폼(Railway 등)은 PORT 환경변수를 주입한다. 로컬 기본값은 8080.
const PORT = Number(process.env.PORT ?? 8080);

const rooms = new Map<string, GameRoom>();

/** 연결별 컨텍스트: 어느 방의 몇 번 플레이어인지. */
interface ConnCtx {
  room: GameRoom;
  playerId: PlayerId;
}
const conns = new Map<WebSocket, ConnCtx>();

function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자(I,O,0,1) 제외
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

// HTTP 서버(헬스체크용) 위에 WebSocket 서버를 얹는다. 플랫폼 헬스체크가 200 을 받도록.
const httpServer = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]; // 쿼리스트링 무시
  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Le Truc WebSocket 서버 실행 중');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { kind: 'error', message: '잘못된 메시지 형식입니다.' });
      return;
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const ctx = conns.get(ws);
    if (!ctx) return;
    ctx.room.handleDisconnect(ctx.playerId);
    conns.delete(ws);
    if (ctx.room.isEmpty) rooms.delete(ctx.room.code);
  });
});

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.kind) {
    case 'create': {
      const code = makeRoomCode();
      const room = new GameRoom(code);
      rooms.set(code, room);
      const playerId = room.addPlayer(ws)!; // 새 방이므로 항상 성공(0번)
      conns.set(ws, { room, playerId });
      send(ws, { kind: 'joined', roomCode: code, playerId });
      send(ws, { kind: 'waiting' });
      return;
    }

    case 'join': {
      const room = rooms.get(msg.roomCode.toUpperCase());
      if (!room) {
        send(ws, { kind: 'error', message: '존재하지 않는 방 코드입니다.' });
        return;
      }
      if (room.isFull) {
        send(ws, { kind: 'error', message: '이미 가득 찬 방입니다.' });
        return;
      }
      const playerId = room.addPlayer(ws);
      if (playerId === null) {
        send(ws, { kind: 'error', message: '방에 입장할 수 없습니다.' });
        return;
      }
      conns.set(ws, { room, playerId });
      send(ws, { kind: 'joined', roomCode: room.code, playerId });
      if (room.isFull) {
        room.start(); // 2명이 모두 모이면 게임 시작
      }
      return;
    }

    case 'action': {
      const ctx = conns.get(ws);
      if (!ctx) {
        send(ws, { kind: 'error', message: '방에 참가하지 않았습니다.' });
        return;
      }
      ctx.room.handleAction(ctx.playerId, msg.action);
      return;
    }

    case 'emote': {
      const ctx = conns.get(ws);
      if (ctx) ctx.room.handleEmote(ctx.playerId, msg.emote);
      return;
    }
  }
}

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Le Truc 서버가 포트 ${PORT} 에서 대기 중입니다 (http + ws).`);
});
