'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HeroSpotProps {
  hero?: DisplayableCardData;
  isOpponent: boolean;
  className?: string;
}

export default function HeroSpotClient({ hero, isOpponent, className }: HeroSpotProps) {
  return (
    <div className={cn(`flex items-center justify-center p-1`, className)}>
      <Card className="w-20 h-28 md:w-24 md:h-32 bg-zinc-700/30 border-zinc-600 flex items-center justify-center shadow-md">
        {hero ? (
          <GameCardDisplayClient card={hero} isHero={true} />
        ) : (
          <CardContent className="p-0 flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">Hero</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}