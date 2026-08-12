import type { PublicGameState } from '@le-truc/shared';

export function Scoreboard({ s }: { s: PublicGameState }) {
  const you = s.you;
  const opp = you === 0 ? 1 : 0;

  return (
    <div className="scoreboard">
      <div className="score-block">
        <div className="score-label">상대 {s.dealer === opp && <span className="dealer-chip">딜러</span>}</div>
        <div className="score-value">{s.scores[opp]}</div>
        <div className="trick-pips">
          {[0, 1].map((i) => (
            <span key={i} className={`pip ${s.trickWins[opp] > i ? 'pip-on' : ''}`} />
          ))}
        </div>
      </div>

      <div className="score-center">
        <div className="round-num">{s.roundNumber} 라운드</div>
        <div className="stake-box">
          <span className="stake-label">걸린 승점</span>
          <span className="stake-value">{s.currentStake}</span>
          {s.proposedStake != null && (
            <span className="stake-proposed">→ 제안 {s.proposedStake}</span>
          )}
        </div>
        <div className="target-hint">목표 12점</div>
      </div>

      <div className="score-block">
        <div className="score-label">나 {s.dealer === you && <span className="dealer-chip">딜러</span>}</div>
        <div className="score-value">{s.scores[you]}</div>
        <div className="trick-pips">
          {[0, 1].map((i) => (
            <span key={i} className={`pip ${s.trickWins[you] > i ? 'pip-on' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
