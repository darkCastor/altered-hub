import type { AlteredCard } from '@/types';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, Sword, Gem, Tag, UserCircle, Palette, BookText, Hash } from 'lucide-react'; // Gem for cost, Tag for rarity, etc.

interface CardDisplayProps {
  card: AlteredCard;
  className?: string;
}

export default function CardDisplay({ card, className }: CardDisplayProps) {
  // Assign a data-ai-hint based on card name for placeholder images
  const aiHint = card.name.toLowerCase().split(' ').slice(0, 2).join(' ');

  return (
    <Card className={`w-full max-w-sm overflow-hidden shadow-xl hover:shadow-primary/40 transition-all duration-300 transform hover:scale-105 ${className || ''} bg-card text-card-foreground rounded-xl border-2 border-border`}>
      <CardHeader className="p-0 relative">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            width={300}
            height={420}
            className="object-cover w-full aspect-[300/420]"
            data-ai-hint={aiHint}
          />
        ) : (
          <div className="w-full aspect-[300/420] bg-muted flex items-center justify-center" data-ai-hint={aiHint}>
            <span className="text-muted-foreground">No Image</span>
          </div>
        )}
        <div className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/70 to-transparent">
          <CardTitle className="font-headline text-xl text-primary-foreground truncate">{card.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <Badge variant="secondary" className="capitalize bg-secondary text-secondary-foreground">{card.type}</Badge>
          {card.faction && <Badge variant="outline" className="capitalize border-primary text-primary">{card.faction}</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {typeof card.cost === 'number' && (
            <div className="flex items-center gap-1.5">
              <Gem className="h-4 w-4 text-accent" />
              <span className="font-semibold">Cost:</span>
              <span>{card.cost}</span>
            </div>
          )}
          {typeof card.attack === 'number' && (
            <div className="flex items-center gap-1.5">
              <Sword className="h-4 w-4 text-accent" />
              <span className="font-semibold">Attack:</span>
              <span>{card.attack}</span>
            </div>
          )}
          {typeof card.health === 'number' && (
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-accent" />
              <span className="font-semibold">Health:</span>
              <span>{card.health}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-accent" />
            <span className="font-semibold">Rarity:</span>
            <span className="capitalize">{card.rarity}</span>
          </div>
        </div>

        {card.description && (
          <div>
            <h4 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
              <BookText className="h-4 w-4 text-accent" />
              Ability:
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
          </div>
        )}

        {card.keywords && card.keywords.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-1">Keywords:</h4>
            <div className="flex flex-wrap gap-1.5">
              {card.keywords.map(keyword => (
                <Badge key={keyword} variant="outline" className="text-xs">{keyword}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 border-t border-border/50 text-xs text-muted-foreground space-y-1">
        {card.artist && (
          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            <span>Artist: {card.artist}</span>
          </div>
        )}
        {card.cardNumber && (
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            <span>{card.cardNumber}</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
