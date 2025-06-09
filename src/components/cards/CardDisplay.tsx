
'use client';

import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
  isDeckPanelOpen?: boolean;
  isSelectedInPanel?: boolean; // Is this specific card.id in the deck
  isLimitForCardCategoryReached?: boolean; // Is the general limit for this card's name/type met in the deck
}

export default function CardDisplay({
  card,
  className,
  onStartNewDeck,
  isDeckPanelOpen,
  isSelectedInPanel,
  isLimitForCardCategoryReached,
}: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

  const handleNewDeckButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStartNewDeck) {
      onStartNewDeck(card);
    }
  };

  const cardBaseClasses = "relative w-full max-w-sm overflow-hidden shadow-xl group transition-all duration-300 transform hover:scale-150 hover:z-20 bg-card text-card-foreground rounded-xl border-2 border-border hover:shadow-primary/40";
  
  let dynamicCardClasses = '';
  if (isDeckPanelOpen) {
    if (isLimitForCardCategoryReached) {
      dynamicCardClasses = "ring-2 ring-accent border-accent shadow-accent/30"; // Green border
    } else if (isSelectedInPanel) {
      dynamicCardClasses = "ring-1 ring-primary/70 border-primary/70 shadow-primary/20"; // Purple border
    }
  }

  return (
    <Card
      className={cn(
        cardBaseClasses,
        dynamicCardClasses,
        className || ''
      )}
    >
      <CardHeader className="p-0">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name || 'Altered TCG Card'}
            width={300}
            height={420}
            className="object-cover w-full aspect-[300/420]"
            data-ai-hint={aiHint}
            priority
          />
        ) : (
          <div className="w-full aspect-[300/420] bg-muted flex items-center justify-center" data-ai-hint={aiHint}>
            <span className="text-muted-foreground">No Image</span>
          </div>
        )}
      </CardHeader>

      {!isDeckPanelOpen && onStartNewDeck && (
        <Button
          variant="default"
          onClick={handleNewDeckButtonClick}
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-10"
          aria-label={`Start new deck with ${card.name}`}
        >
          <Plus className="h-8 w-8" />
        </Button>
      )}
    </Card>
  );
}

