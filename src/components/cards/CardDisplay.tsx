
import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
}

export default function CardDisplay({ card, className }: CardDisplayProps) {
  const aiHint = card.name ? card.name.toLowerCase().split(' ').slice(0, 2).join(' ') : 'card image';

  return (
    <Card className={`w-full max-w-sm overflow-hidden shadow-xl hover:shadow-primary/40 transition-all duration-300 transform hover:scale-150 ${className || ''} bg-card text-card-foreground rounded-xl border-2 border-border`}>
      <CardHeader className="p-0 relative">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name || 'Altered TCG Card'}
            width={300}
            height={420}
            className="object-cover w-full aspect-[300/420]"
            data-ai-hint={aiHint}
            priority // Helps with LCP for images that are likely to be visible early
          />
        ) : (
          <div className="w-full aspect-[300/420] bg-muted flex items-center justify-center" data-ai-hint={aiHint}>
            <span className="text-muted-foreground">No Image</span>
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
