
'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';

interface PlayerHandProps {
  cards: DisplayableCardData[];
  owner: 'self' | 'opponent';
  onCardClick: (card: DisplayableCardData) => void;
}

export default function PlayerHandClient({ cards, owner, onCardClick }: PlayerHandProps) {
  const handAlignment = owner === 'self' ? 'justify-center' : 'justify-center'; // Or specific alignment if needed
  const cardRotation = owner === 'opponent' ? 'rotate-180' : ''; // Only if you want to rotate opponent's cards fully

  return (
    <div className={`flex ${handAlignment} items-center p-1 h-32 md:h-40 bg-black/20 rounded-md overflow-x-auto min-w-0`}>
      {cards.length === 0 && <p className="text-xs text-muted-foreground italic">{owner === 'self' ? "Your hand is empty" : "Opponent's hand"}</p>}
      {cards.map((card, index) => (
        <div
          key={card.instanceId || card.originalCardId + index} // Fallback key
          className={`mx-[-10px] md:mx-[-15px] hover:z-10 transition-transform duration-150 ease-in-out ${owner === 'self' ? 'hover:scale-110 hover:-translate-y-2' : ''} ${cardRotation}`}
          onClick={() => owner === 'self' && onCardClick(card)}
          role={owner === 'self' ? 'button' : undefined}
          aria-label={owner === 'self' ? `Play ${card.name}` : card.name}
        >
          <GameCardDisplayClient card={card} isOpponentHandCard={owner === 'opponent'} />
        </div>
      ))}
    </div>
  );
}
