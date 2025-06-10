'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface BoardZoneProps {
  cards: DisplayableCardData[];
  zoneType: string;
  owner: 'self' | 'opponent' | 'shared';
  className?: string;
  onClick?: () => void;
  isTargetable?: boolean;
}

export default function BoardZoneClient({ cards, zoneType, owner, className, onClick, isTargetable }: BoardZoneProps) {
  const isClickable = !!onClick && isTargetable;

  return (
    <div
      className={cn(
        "flex-1 p-1 bg-black/10 rounded-md h-full min-w-0 flex flex-col",
        isClickable && 'cursor-pointer hover:bg-green-900/50 transition-colors',
        isClickable && owner === 'self' && 'ring-2 ring-offset-2 ring-offset-zinc-800 ring-green-500/80',
        className
      )}
      onClick={onClick}
    >
      <p className="text-xs text-center text-muted-foreground mb-1 truncate">{zoneType} ({cards.length})</p>
      <ScrollArea className="h-[calc(100%-1.25rem)]">
        <div className="flex flex-wrap gap-1 p-1 justify-center items-start">
          {cards.length === 0 && <div className="text-xs text-zinc-600 italic h-full flex items-center justify-center">Empty</div>}
          {cards.map((card) => (
            <div key={card.instanceId} className="w-16 h-22 md:w-20 md:h-28">
              <GameCardDisplayClient card={card} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}