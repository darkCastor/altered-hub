
import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle } from 'lucide-react'; // Added CheckCircle
import { cn } from '@/lib/utils'; // For conditional classnames

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
  isSelected?: boolean; // To show if card is in current deck panel
}

export default function CardDisplay({ card, className, onStartNewDeck, isSelected }: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onStartNewDeck) {
      onStartNewDeck(card);
    }
  };

  return (
    <Card 
      className={cn(
        `relative w-full max-w-sm overflow-hidden shadow-xl group transition-all duration-300 transform hover:scale-105 bg-card text-card-foreground rounded-xl border-2 border-border hover:shadow-primary/40`,
        isSelected && "ring-2 ring-accent border-accent shadow-accent/30", // Highlight if selected
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
      
      {/* Conditional rendering for the button based on 'isSelected' */}
      {isSelected ? (
        <Button
          variant="default"
          className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-10 bg-green-600 hover:bg-green-700"
          aria-label={`${card.name} is in deck`}
          onClick={(e) => e.stopPropagation()} // Prevent card click if button is for status
        >
          <CheckCircle className="h-8 w-8" />
        </Button>
      ) : (
        onStartNewDeck && (
          <Button
            variant="default" 
            onClick={handleButtonClick}
            className="absolute bottom-[18px] right-2 h-14 w-14 flex items-center justify-center z-10"
            aria-label={`Start new deck with ${card.name}`}
          >
            <Plus className="h-8 w-8" /> 
          </Button>
        )
      )}
    </Card>
  );
}

    