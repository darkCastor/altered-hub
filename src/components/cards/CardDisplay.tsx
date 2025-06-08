
import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
  onStartNewDeck?: (card: AlteredCard) => void;
}

export default function CardDisplay({ card, className, onStartNewDeck }: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onStartNewDeck) {
      onStartNewDeck(card);
    } else {
      console.log("Start new deck with:", card.name);
    }
  };

  return (
    <Card className={`relative w-full max-w-sm overflow-hidden shadow-xl group hover:shadow-primary/40 transition-all duration-300 transform hover:scale-150 hover:z-20 ${className || ''} bg-card text-card-foreground rounded-xl border-2 border-border`}>
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
      
      <Button
        variant="secondary"
        size="sm"
        onClick={handleButtonClick}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-in-out z-30 scale-[66.67%] group-hover:scale-[66.67%]"
        aria-label={`Start new deck with ${card.name}`}
      >
        <Plus className="h-4 w-4" /> 
      </Button>
    </Card>
  );
}
