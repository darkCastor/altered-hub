
import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void; // For starting a NEW deck when panel is CLOSED
  isSelectedInPanel?: boolean; // Is the card currently selected in the OPEN deck panel?
  isDeckPanelOpen?: boolean; // Is the deck panel currently open?
}

export default function CardDisplay({ card, className, onStartNewDeck, isSelectedInPanel, isDeckPanelOpen }: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

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
        isDeckPanelOpen && isSelectedInPanel && "ring-2 ring-accent border-accent shadow-accent/30", // Highlight if selected in open panel
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
      
      {/* Button for starting a new deck (only if panel is closed and onStartNewDeck is provided) */}
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

      {/* Button/Indicator for when card is selected in an open deck panel */}
      {isDeckPanelOpen && isSelectedInPanel && (
        <Button
          variant="default"
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-10 bg-green-600 hover:bg-green-700"
          aria-label={`${card.name} is in deck`}
          onClick={(e) => e.stopPropagation()} // Prevent card click if button is for status
        >
          <CheckCircle className="h-8 w-8" />
        </Button>
      )}
    </Card>
  );
}
