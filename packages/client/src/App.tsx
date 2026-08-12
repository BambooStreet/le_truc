import { useGameSocket } from './useGameSocket';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';

export function App() {
  const sock = useGameSocket();

  if (sock.screen === 'lobby') {
    return <Lobby sock={sock} />;
  }

  if (sock.screen === 'waiting') {
    return (
      <div className="waiting">
        <h1 className="title">대기 중</h1>
        <p>상대에게 아래 방 코드를 알려주세요.</p>
        <div className="room-code-big">{sock.roomCode}</div>
        <p className="waiting-hint">상대가 입장하면 게임이 자동으로 시작됩니다.</p>
      </div>
    );
  }

  return (
    <div className="app">
      {sock.opponentLeft && (
        <div className="error-banner">상대가 나갔습니다. 새 게임을 시작하세요.</div>
      )}
      {sock.error && (
        <div className="error-banner" onClick={sock.clearError}>
          {sock.error} (탭하여 닫기)
        </div>
      )}
      {sock.state && (
        <GameBoard
          s={sock.state}
          events={sock.events}
          emotes={sock.emotes}
          sendAction={sock.sendAction}
          sendEmote={sock.sendEmote}
        />
      )}
    </div>
  );
}
