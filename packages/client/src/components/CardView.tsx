import type { Card } from '@le-truc/shared';
import { isRed, rankLabel, SUIT_SYMBOL } from '../format';

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function CardView({ card, faceDown, selected, disabled, onClick, size = 'md' }: Props) {
  const cls = [
    'card',
    `card-${size}`,
    faceDown || !card ? 'card-back' : isRed(card) ? 'card-red' : 'card-black',
    selected ? 'card-selected' : '',
    onClick && !disabled ? 'card-clickable' : '',
    disabled ? 'card-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} onClick={!disabled ? onClick : undefined}>
      {faceDown || !card ? (
        <div className="card-back-pattern" />
      ) : (
        <>
          <span className="card-rank">{rankLabel(card)}</span>
          <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
        </>
      )}
    </div>
  );
}
