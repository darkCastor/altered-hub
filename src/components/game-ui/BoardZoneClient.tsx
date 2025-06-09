
'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BoardZoneProps {
  cards: DisplayableCardData[];
  zoneType: string;
  owner: 'self' | 'opponent' | 'shared'; // To handle potential styling differences
}

export default function BoardZoneClient({ cards, zoneType, owner }: BoardZoneProps) {
  return (
    <div className="flex-1 p-1 bg-black/10 rounded-md h-full min-w-0">
      <p className="text-xs text-center text-muted-foreground mb-1 truncate">{zoneType} ({cards.length})</p>
      <ScrollArea className="h-[calc(100%-1.25rem)]"> {/* Adjust height based on title */}
        <div className="flex flex-wrap gap-1 p-1 justify-center items-start">
          {cards.length === 0 && <div className="text-xs text-zinc-600 italic h-full flex items-center justify-center">Empty</div>}
          {cards.map((card, index) => (
            <div key={card.instanceId || card.originalCardId + index} className="w-16 h-22 md:w-20 md:h-28">
              <GameCardDisplayClient card={card} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
