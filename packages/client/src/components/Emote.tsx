import { useEffect, useState } from 'react';

// shared 의 EMOTES 프리셋과 동일하게 유지한다(서버가 이 목록으로 검증).
const EMOTES = ['👍', '😎', '😂', '😮', '😢', '😡', '🔥', '🤔'];

/** 하단 감정 표현 선택 바. */
export function EmoteBar({ onSend }: { onSend: (emote: string) => void }) {
  return (
    <div className="emote-bar">
      {EMOTES.map((e) => (
        <button key={e} className="emote-btn" onClick={() => onSend(e)} title="감정 표현 보내기">
          {e}
        </button>
      ))}
    </div>
  );
}

/** 특정 방향에 감정 표현 말풍선을 잠깐 띄운다. seq 가 바뀔 때마다 재생된다. */
export function EmoteBubble({
  entry,
  position,
}: {
  entry: { emote: string; seq: number } | undefined;
  position: 'top' | 'bottom';
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [entry?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !entry) return null;
  return (
    <div className={`emote-bubble emote-${position}`} key={entry.seq}>
      {entry.emote}
    </div>
  );
}
