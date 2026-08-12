import { useEffect, useRef, useState } from 'react';
import type { ClientAction, PublicGameState } from '@le-truc/shared';
import { CardView } from './CardView';
import { Scoreboard } from './Scoreboard';
import { ActionPanel } from './ActionPanel';
import { EmoteBar, EmoteBubble } from './Emote';
import type { EmoteState, EventLogEntry } from '../useGameSocket';
import { eventText } from '../format';

interface Props {
  s: PublicGameState;
  events: EventLogEntry[];
  emotes: EmoteState;
  sendAction: (a: ClientAction) => void;
  sendEmote: (emote: string) => void;
}

export function GameBoard({ s, events, emotes, sendAction, sendEmote }: Props) {
  const you = s.you;
  const opp = you === 0 ? 1 : 0;
  const [selected, setSelected] = useState<string | null>(null);

  const myTurn = s.turn === you;
  const canPlayCard = myTurn && s.availableActions.some((a) => a.type === 'PLAY_CARD');

  // 새 승부/라운드로 넘어가면 선택 초기화
  useEffect(() => {
    if (!canPlayCard) setSelected(null);
  }, [canPlayCard, s.phase, s.trickHistory.length]);

  const reveal = s.phase === 'TRICK_REVEAL' ? s.revealedTrick : null;

  // 중앙 승부 존에 표시할 카드
  const oppSlot = reveal
    ? { card: reveal.cards[opp], faceDown: false, win: reveal.winner === opp }
    : s.committed[opp]
      ? { card: null, faceDown: true, win: false }
      : null;
  const youSlot = reveal
    ? { card: reveal.cards[you], faceDown: false, win: reveal.winner === you }
    : s.yourCommitted
      ? { card: s.yourCommitted, faceDown: false, win: false }
      : null;

  return (
    <div className="board">
      <Scoreboard s={s} />

      <div className={`turn-indicator ${myTurn ? 'turn-mine' : ''}`}>
        {s.phase === 'GAME_OVER'
          ? ' '
          : myTurn
            ? '내 차례 — 행동하세요'
            : s.turn === opp
              ? '상대 차례'
              : ' '}
      </div>

      {/* 상대 손패 (뒷면, 장수만) */}
      <div className="opponent-hand">
        {Array.from({ length: s.opponentHandCount }).map((_, i) => (
          <CardView key={i} faceDown size="sm" />
        ))}
      </div>
      <EmoteBubble entry={emotes[opp]} position="top" />

      {/* 중앙 승부 존 */}
      <div className="trick-zone">
        <div className={`trick-slot ${oppSlot?.win ? 'slot-win' : ''}`}>
          {oppSlot ? <CardView card={oppSlot.card} faceDown={oppSlot.faceDown} size="lg" /> : <div className="slot-empty" />}
          <div className="slot-label">상대</div>
        </div>

        {reveal && (
          <div className="reveal-outcome">
            {reveal.winner === null ? '무승부' : reveal.winner === you ? '나 승리' : '상대 승리'}
          </div>
        )}

        <div className={`trick-slot ${youSlot?.win ? 'slot-win' : ''}`}>
          {youSlot ? <CardView card={youSlot.card} faceDown={youSlot.faceDown} size="lg" /> : <div className="slot-empty" />}
          <div className="slot-label">나</div>
        </div>
      </div>

      {/* 내 손패 */}
      <div className="my-hand">
        {s.yourHand.map((c) => (
          <CardView
            key={c.id}
            card={c}
            size="md"
            selected={selected === c.id}
            disabled={!canPlayCard}
            onClick={() => setSelected(c.id)}
          />
        ))}
      </div>

      <EmoteBubble entry={emotes[you]} position="bottom" />

      {/* 액션 패널 */}
      <ActionPanel s={s} selectedCardId={selected} onClearSelection={() => setSelected(null)} sendAction={sendAction} />

      {/* 감정 표현 바 */}
      <EmoteBar onSend={sendEmote} />

      {/* 이벤트 로그 */}
      <EventLog events={events} you={you} />

      {/* 라운드/게임 종료 오버레이 */}
      {s.phase === 'ROUND_OVER' && s.lastRoundResult && (
        <div className="overlay overlay-round">
          <div className="overlay-card">
            <h2>라운드 종료</h2>
            <p>
              {s.lastRoundResult.winner === null
                ? '무효 라운드 — 승점 없음'
                : `${s.lastRoundResult.winner === you ? '내가' : '상대가'} ${s.lastRoundResult.stakeAwarded}점 획득`}
            </p>
            <p className="overlay-scores">
              나 {s.scores[you]} : {s.scores[opp]} 상대
            </p>
            <p className="overlay-next">다음 라운드 준비 중…</p>
          </div>
        </div>
      )}

      {s.phase === 'GAME_OVER' && (
        <div className="overlay overlay-game">
          <div className="overlay-card">
            <h2>{s.winner === you ? '🎉 승리!' : '패배'}</h2>
            <p className="overlay-scores">
              나 {s.scores[you]} : {s.scores[opp]} 상대
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
              새 게임
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventLog({ events, you }: { events: EventLogEntry[]; you: PublicGameState['you'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [events.length]);

  return (
    <div className="event-log" ref={ref}>
      {events.map((e) => (
        <div key={e.id} className="event-line">
          {eventText(e.event, you)}
        </div>
      ))}
    </div>
  );
}
