
'use client';

import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Ban } from 'lucide-react'; // Added Ban icon
import { cn } from '@/lib/utils';
import React from 'react';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
  isDeckPanelOpen?: boolean;
  isSelectedInPanel?: boolean;
  isLimitForCardCategoryReached?: boolean;
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
    e.stopPropagation(); // Prevent card's own onClick if button is clicked
    if (onStartNewDeck && !card.isSuspended) {
      onStartNewDeck(card);
    }
  };

  let dynamicCardClasses = '';
  if (isDeckPanelOpen && !card.isSuspended) {
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
        !card.isSuspended && "transform hover:scale-150 hover:z-20 hover:shadow-primary/40",
        dynamicCardClasses,
        card.isSuspended && "opacity-60 cursor-not-allowed",
        className || ''
      )}
    >
      <CardHeader className="p-0 relative"> {/* Ensure header is relative for overlay positioning */}
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
         {card.isSuspended && (
          <div className="absolute inset-0 bg-destructive/70 flex items-center justify-center z-10 rounded-lg pointer-events-none">
            <Ban className="h-1/3 w-1/3 text-destructive-foreground opacity-90" />
          </div>
        )}
      </CardHeader>

      {!isDeckPanelOpen && onStartNewDeck && !card.isSuspended && (
        <Button
          variant="default"
          onClick={handleNewDeckButtonClick}
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-20" // Ensure button is above potential overlay if needed
          aria-label={`Start new deck with ${card.name}`}
        >
          <Plus className="h-8 w-8" />
        </Button>
      )}
    </Card>
  );
}
