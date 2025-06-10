'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Shield, Sword, Heart, Gem } from 'lucide-react';

interface GameCardDisplayProps {
  card?: DisplayableCardData; // Make card optional to be safe
  isOpponentHandCard?: boolean;
  isHero?: boolean;
  className?: string;
}

export default function GameCardDisplayClient({ card, isOpponentHandCard, isHero, className }: GameCardDisplayProps) {
  // FIX: Add a guard clause to prevent crashing if card data is invalid or missing.
  if (!card || !card.instanceId) {
    return null;
  }

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

  // FIX: Use optional chaining and nullish coalescing for safety.
  // This ensures that even if statuses or counters are undefined, we don't crash.
  const hasStatusesOrCounters = (card.statuses?.length ?? 0) > 0 || (card.counters?.length ?? 0) > 0;

  return (
    <div className={cn("w-full h-full relative shadow-md rounded-sm group", className)}>
      {/* Card Image or Placeholder */}
      {card.imageUrl ? (
        <Image src={card.imageUrl} alt={card.name} fill={true} style={{ objectFit: 'cover' }} className="rounded-sm" data-ai-hint={aiHint} />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center rounded-sm border border-border">
          <span className="text-xs text-muted-foreground p-1 text-center">{card.name}</span>
        </div>
      )}

      {/* Cost */}
      {!isHero && card.cost !== undefined && (
        <div className="absolute top-0 left-0 bg-black/70 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-zinc-400 -m-1">
          {card.cost}
        </div>
      )}

      {/* Stats */}
      {!isHero && (card.attack !== undefined || card.health !== undefined) && (
        <>
          <div className="absolute bottom-0 left-0 bg-black/70 text-yellow-300 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-orange-400 -m-1">
            {card.attack}
          </div>
          <div className="absolute bottom-0 right-0 bg-black/70 text-red-400 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-red-600 -m-1">
            {card.health}
          </div>
        </>
      )}

      {/* Statuses and Counters Overlay */}
      {hasStatusesOrCounters && (
        <div className="absolute bottom-0 w-full p-0.5 bg-black/60 flex justify-center items-center gap-1">
          {card.statuses?.map(status => (
            <Badge key={status} variant="secondary" className="text-white text-[0.5rem] leading-none px-1 py-0.5 h-auto">{status.slice(0, 3).toUpperCase()}</Badge>
          ))}
          {card.counters?.map(counter => (
            <Badge key={counter.type} variant="destructive" className="text-white text-[0.5rem] leading-none px-1 py-0.5 h-auto">
              {`${counter.type.slice(0, 3).toUpperCase()} +${counter.amount}`}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
