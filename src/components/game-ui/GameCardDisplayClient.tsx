
'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface GameCardDisplayProps {
  card: DisplayableCardData;
  isOpponentHandCard?: boolean;
  isHero?: boolean;
  className?: string;
}

export default function GameCardDisplayClient({ card, isOpponentHandCard, isHero, className }: GameCardDisplayProps) {
  if (isOpponentHandCard) {
    return (
      <Card className={cn("w-16 h-24 md:w-20 md:h-28 bg-zinc-600 border-zinc-500 shadow-md flex items-center justify-center", className)}>
        <CardContent className="p-0">
          <p className="text-xs text-zinc-300 -rotate-90">CARD</p>
        </CardContent>
      </Card>
    );
  }
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'game card';

  return (
    <div className={cn("w-full h-full relative shadow-md rounded-sm overflow-hidden group", className)}>
      {card.imageUrl ? (
        <Image
          src={card.imageUrl}
          alt={card.name}
          fill={true}
          style={{ objectFit: 'cover' }}
          className="rounded-sm"
          data-ai-hint={aiHint}
          unoptimized 
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center rounded-sm border border-border">
          <span className="text-xs text-muted-foreground p-1 text-center">{card.name}</span>
        </div>
      )}
      {/* Overlay for stats - simplified */}
      {!isHero && (card.cost !== undefined || card.attack !== undefined || card.health !== undefined) && (
         <div className="absolute top-0 left-0 bg-black/50 text-white text-[0.5rem] px-0.5 rounded-br-sm">
            {card.cost}
        </div>
      )}
      {/* Add more overlays for attack/health if needed, carefully positioned */}
    </div>
  );
}

