
'use client';

import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useState, useEffect } from 'react';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
  isSelectedInPanel?: boolean;
  isDeckPanelOpen?: boolean;
}

export default function CardDisplay({ card, className, onStartNewDeck, isSelectedInPanel, isDeckPanelOpen }: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';
  const [showTemporaryCheckmark, setShowTemporaryCheckmark] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isDeckPanelOpen && isSelectedInPanel) {
      setShowTemporaryCheckmark(true);
      timer = setTimeout(() => {
        setShowTemporaryCheckmark(false);
      }, 1000);
    } else {
      setShowTemporaryCheckmark(false); // Ensure it's hidden if not selected or panel closed
    }
    return () => clearTimeout(timer);
  }, [isSelectedInPanel, isDeckPanelOpen, card.id]); // Added card.id to re-trigger for different cards

  const handleNewDeckButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStartNewDeck) {
      onStartNewDeck(card);
    }
  };

  return (
    <Card
      className={cn(
        `relative w-full max-w-sm overflow-hidden shadow-xl group transition-all duration-300 transform hover:scale-150 hover:z-20 bg-card text-card-foreground rounded-xl border-2 border-border hover:shadow-primary/40`,
        isDeckPanelOpen && isSelectedInPanel && "ring-2 ring-accent border-accent shadow-accent/30",
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

      {showTemporaryCheckmark && (
        <Button
          variant="default"
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-10 bg-green-600 hover:bg-green-700 pointer-events-none"
          aria-label={`${card.name} is in deck`}
          tabIndex={-1} 
        >
          <CheckCircle className="h-8 w-8" />
        </Button>
      )}
    </Card>
  );
}
