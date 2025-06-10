'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';
import { cn } from '@/lib/utils';

interface PlayerHandProps {
  cards: DisplayableCardData[];
  owner: 'self' | 'opponent';
  onCardClick: (card: DisplayableCardData) => void;
  selectedCardId?: string | null;
}

export default function PlayerHandClient({ cards, owner, onCardClick, selectedCardId }: PlayerHandProps) {
  const handAlignment = 'justify-center';

  return (
    <div className={`flex ${handAlignment} items-center p-1 h-full md:h-40 bg-black/20 rounded-md overflow-x-auto min-w-0`}>
      {cards.length === 0 && <p className="text-xs text-muted-foreground italic">{owner === 'self' ? "Your hand is empty" : "Opponent's hand"}</p>}
      {cards.map((card) => (
        <div
          key={card.instanceId}
          className={cn(
            "mx-[-10px] md:mx-[-15px] hover:z-10 transition-all duration-150 ease-in-out w-16 h-24 md:w-20 md:h-28",
            owner === 'self' && 'cursor-pointer hover:scale-125 hover:-translate-y-3',
            card.instanceId === selectedCardId && 'scale-125 -translate-y-3 z-10 ring-2 ring-yellow-400 rounded-lg'
          )}
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