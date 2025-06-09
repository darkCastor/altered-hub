
'use client';

import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';
import { cardTypesLookup } from '@/data/cards'; // Import lookup

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
  isDeckPanelOpen?: boolean;
  isSelectedInPanel?: boolean;
  isLimitForCardCategoryReached?: boolean;
}

const TOKEN_CARD_TYPES = [
  cardTypesLookup.TOKEN.name,
  cardTypesLookup.TOKEN_MANA.name,
  cardTypesLookup.FOILER.name,
];


export default function CardDisplay({
  card,
  className,
  onStartNewDeck,
  isDeckPanelOpen,
  isSelectedInPanel,
  isLimitForCardCategoryReached,
}: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

  const isTokenCard = TOKEN_CARD_TYPES.includes(card.type);

  const handleNewDeckButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onStartNewDeck && !card.isSuspended && !isTokenCard) {
      onStartNewDeck(card);
    }
  };

  let dynamicCardClasses = '';
  if (isDeckPanelOpen && !card.isSuspended && !isTokenCard) {
    if (isLimitForCardCategoryReached) {
      dynamicCardClasses = "ring-2 ring-accent border-accent shadow-accent/30";
    } else if (isSelectedInPanel) {
      dynamicCardClasses = "ring-1 ring-primary/70 border-primary/70 shadow-primary/20";
    }
  }

  return (
    <Card
      className={cn(
        "relative w-full max-w-sm overflow-hidden shadow-xl group transition-all duration-300 bg-card text-card-foreground rounded-xl border-2 border-border",
        !card.isSuspended && !isTokenCard && "transform hover:scale-150 hover:z-20 hover:shadow-primary/40",
        dynamicCardClasses,
        (card.isSuspended || isTokenCard) && "opacity-60 cursor-not-allowed",
        className || ''
      )}
    >
      <CardHeader className="p-0 relative">
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
         {(card.isSuspended || isTokenCard) && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center z-10 rounded-lg pointer-events-none",
            card.isSuspended ? "bg-destructive/70" : "bg-muted-foreground/50" // Different overlay for suspended vs token
          )}>
            <Ban className={cn(
              "h-1/3 w-1/3 opacity-90",
              card.isSuspended ? "text-destructive-foreground" : "text-card-foreground"
            )} />
          </div>
        )}
      </CardHeader>

      {!isDeckPanelOpen && onStartNewDeck && !card.isSuspended && !isTokenCard && (
        <Button
          variant="default"
          onClick={handleNewDeckButtonClick}
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-20" 
          aria-label={`Start new deck with ${card.name}`}
        >
          <Plus className="h-8 w-8" />
        </Button>
      )}
    </Card>
  );
}

