import { useState } from 'react';
import type { GameSocket } from '../useGameSocket';

export function Lobby({ sock }: { sock: GameSocket }) {
  const [code, setCode] = useState('');

  return (
    <div className="lobby">
      <h1 className="title">Le Truc</h1>
      <p className="subtitle">1:1 블러핑 카드게임</p>

      <div className="lobby-card">
        <button className="btn btn-primary btn-lg" onClick={sock.createRoom}>
          새 게임 만들기
        </button>

        <div className="lobby-divider">또는</div>

        <div className="join-row">
          <input
            className="code-input"
            placeholder="방 코드 (예: ABCD)"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code && sock.joinRoom(code)}
          />
          <button
            className="btn btn-secondary btn-lg"
            disabled={code.length < 4}
            onClick={() => sock.joinRoom(code)}
          >
            입장
          </button>
        </div>
      </div>

      {sock.error && <div className="error-banner">{sock.error}</div>}

      <div className="rules-hint">
        <p>서열: 7 &gt; 8 &gt; A &gt; K &gt; Q &gt; J &gt; 10 &gt; 9 (문양 무시)</p>
        <p>누적 12점을 먼저 달성하면 승리 · 라운드마다 승점을 걸고 블러핑</p>
      </div>
    </div>
  );
}
