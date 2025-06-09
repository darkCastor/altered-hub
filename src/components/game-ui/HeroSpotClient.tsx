
'use client';

import type { DisplayableCardData } from '@/app/play/[deckId]/page';
import GameCardDisplayClient from './GameCardDisplayClient';
import { Card, CardContent } from '@/components/ui/card';

interface HeroSpotProps {
  hero?: DisplayableCardData;
  isOpponent: boolean;
}

export default function HeroSpotClient({ hero, isOpponent }: HeroSpotProps) {
  return (
    <div className={`flex items-center ${isOpponent ? 'justify-start' : 'justify-end'} p-1`}>
      <Card className="w-20 h-28 md:w-24 md:h-32 bg-zinc-700/30 border-zinc-600 flex items-center justify-center shadow-md">
        {hero ? (
          <GameCardDisplayClient card={hero} isHero={true} />
        ) : (
          <CardContent className="p-0">
            <p className="text-xs text-muted-foreground">Hero</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
