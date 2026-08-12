import { useEffect, useState } from 'react';
import type { AvailableAction, ClientAction, PublicGameState } from '@le-truc/shared';

interface Props {
  s: PublicGameState;
  selectedCardId: string | null;
  onClearSelection: () => void;
  sendAction: (a: ClientAction) => void;
}

function find<T extends AvailableAction['type']>(
  actions: AvailableAction[],
  type: T,
): Extract<AvailableAction, { type: T }> | undefined {
  return actions.find((a) => a.type === type) as never;
}

export function ActionPanel({ s, selectedCardId, onClearSelection, sendAction }: Props) {
  const acts = s.availableActions;

  const play = find(acts, 'PLAY_CARD');
  const respondRaise = find(acts, 'RESPOND_RAISE');
  const canForfeit = !!find(acts, 'FORFEIT');
  const redistOffer = !!find(acts, 'REQUEST_REDISTRIBUTION');
  const redistRespond = !!find(acts, 'RESPOND_REDISTRIBUTION');

  // ── 재분배 요청 (비딜러) ──
  if (redistOffer) {
    return (
      <div className="action-panel">
        <div className="action-prompt">첫 승부 전 — 카드를 재분배할까요?</div>
        <div className="action-row">
          <button className="btn btn-primary" onClick={() => sendAction({ type: 'REQUEST_REDISTRIBUTION' })}>
            재분배 요청
          </button>
          <button className="btn btn-secondary" onClick={() => sendAction({ type: 'DECLINE_REDISTRIBUTION' })}>
            그대로 진행
          </button>
        </div>
      </div>
    );
  }

  // ── 재분배 수락/거절 (딜러) ──
  if (redistRespond) {
    return (
      <div className="action-panel">
        <div className="action-prompt">상대가 재분배를 요청했습니다.</div>
        <div className="action-row">
          <button className="btn btn-primary" onClick={() => sendAction({ type: 'RESPOND_REDISTRIBUTION', accept: true })}>
            수락 (다시 나눠주기)
          </button>
          <button className="btn btn-secondary" onClick={() => sendAction({ type: 'RESPOND_REDISTRIBUTION', accept: false })}>
            거절
          </button>
        </div>
      </div>
    );
  }

  // ── 카드 제출 (+ 선공이면 인상) ──
  if (play) {
    return (
      <PlayCardPanel
        canRaise={play.canRaise}
        raiseMin={play.raiseMin}
        raiseMax={play.raiseMax}
        selectedCardId={selectedCardId}
        canForfeit={canForfeit}
        onSubmit={(raiseTo) => {
          if (!selectedCardId) return;
          sendAction({ type: 'PLAY_CARD', cardId: selectedCardId, raiseTo });
          onClearSelection();
        }}
        onForfeit={() => sendAction({ type: 'FORFEIT' })}
      />
    );
  }

  // ── 인상 응답 ──
  if (respondRaise) {
    return (
      <RespondRaisePanel
        proposed={s.proposedStake ?? 0}
        canReRaise={respondRaise.canReRaise}
        raiseMin={respondRaise.raiseMin}
        raiseMax={respondRaise.raiseMax}
        onAccept={() => sendAction({ type: 'RESPOND_RAISE', response: 'accept' })}
        onReRaise={(raiseTo) => sendAction({ type: 'RESPOND_RAISE', response: 'reRaise', raiseTo })}
        onForfeit={() => sendAction({ type: 'RESPOND_RAISE', response: 'forfeit' })}
      />
    );
  }

  // ── 대기 ──
  return (
    <div className="action-panel">
      <div className="action-waiting">상대의 행동을 기다리는 중…</div>
    </div>
  );
}

function PlayCardPanel({
  canRaise,
  raiseMin,
  raiseMax,
  selectedCardId,
  canForfeit,
  onSubmit,
  onForfeit,
}: {
  canRaise: boolean;
  raiseMin?: number;
  raiseMax?: number;
  selectedCardId: string | null;
  canForfeit: boolean;
  onSubmit: (raiseTo?: number) => void;
  onForfeit: () => void;
}) {
  const [raising, setRaising] = useState(false);
  const [raiseTo, setRaiseTo] = useState(raiseMin ?? 2);

  useEffect(() => {
    setRaiseTo(raiseMin ?? 2);
  }, [raiseMin]);

  return (
    <div className="action-panel">
      <div className="action-prompt">
        {selectedCardId ? '이 카드를 제출합니다.' : '제출할 카드를 선택하세요.'}
      </div>

      {canRaise && (
        <label className="raise-toggle">
          <input type="checkbox" checked={raising} onChange={(e) => setRaising(e.target.checked)} />
          승점 인상
          {raising && raiseMin != null && raiseMax != null && (
            <span className="raise-controls">
              <input
                type="number"
                min={raiseMin}
                max={raiseMax}
                value={raiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="raise-input"
              />
              <span className="raise-range">
                ({raiseMin}~{raiseMax}점)
              </span>
            </span>
          )}
        </label>
      )}

      <div className="action-row">
        <button
          className="btn btn-primary"
          disabled={!selectedCardId || (raising && (raiseTo < (raiseMin ?? 0) || raiseTo > (raiseMax ?? 99)))}
          onClick={() => onSubmit(raising ? raiseTo : undefined)}
        >
          {raising ? `제출 + ${raiseTo}점 인상` : '카드 제출'}
        </button>
        {canForfeit && (
          <button className="btn btn-danger" onClick={onForfeit}>
            라운드 포기
          </button>
        )}
      </div>
    </div>
  );
}

function RespondRaisePanel({
  proposed,
  canReRaise,
  raiseMin,
  raiseMax,
  onAccept,
  onReRaise,
  onForfeit,
}: {
  proposed: number;
  canReRaise: boolean;
  raiseMin?: number;
  raiseMax?: number;
  onAccept: () => void;
  onReRaise: (raiseTo: number) => void;
  onForfeit: () => void;
}) {
  const [raiseTo, setRaiseTo] = useState(raiseMin ?? proposed + 1);

  useEffect(() => {
    setRaiseTo(raiseMin ?? proposed + 1);
  }, [raiseMin, proposed]);

  return (
    <div className="action-panel">
      <div className="action-prompt">상대가 {proposed}점을 제안했습니다.</div>
      <div className="action-row">
        <button className="btn btn-primary" onClick={onAccept}>
          {proposed}점 수락
        </button>
        <button className="btn btn-danger" onClick={onForfeit}>
          포기
        </button>
      </div>
      {canReRaise && raiseMin != null && raiseMax != null && (
        <div className="action-row reraise-row">
          <input
            type="number"
            min={raiseMin}
            max={raiseMax}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="raise-input"
          />
          <span className="raise-range">
            ({raiseMin}~{raiseMax}점)
          </span>
          <button
            className="btn btn-secondary"
            disabled={raiseTo < raiseMin || raiseTo > raiseMax}
            onClick={() => onReRaise(raiseTo)}
          >
            재인상
          </button>
        </div>
      )}
    </div>
  );
}
