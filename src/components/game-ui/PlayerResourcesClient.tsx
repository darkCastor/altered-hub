
'use client';

import type { PlayerState } from '@/app/play/[deckId]/page';
import { Leaf, Mountain, Droplets, Gem, Layers, Trash2 } from 'lucide-react'; // Gem for mana, Layers for deck, Trash2 for discard
import { Badge } from '@/components/ui/badge';

interface PlayerResourcesProps {
  playerState: PlayerState;
  isOpponent: boolean;
}

export default function PlayerResourcesClient({ playerState, isOpponent }: PlayerResourcesProps) {
  const { mana, resources, deckCount, discardCount } = playerState;
  const orderClass = isOpponent ? 'flex-col' : 'flex-col';

  return (
    <div className={`flex ${orderClass} items-center justify-between p-1 space-y-1 md:space-y-0 md:flex-row md:space-x-2 bg-black/10 rounded`}>
      {/* Mana Display */}
      <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-700/50 rounded-md">
        <Gem className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{mana.current}/{mana.max}</span>
        <span className="text-xs text-muted-foreground">MANA</span>
      </div>

      {/* Elemental Resources */}
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="border-green-500 text-green-400 bg-transparent px-1.5 py-0.5">
          <Leaf className="h-3 w-3 mr-1" />
          <span className="text-xs">{resources.forest}</span>
        </Badge>
        <Badge variant="outline" className="border-orange-500 text-orange-400 bg-transparent px-1.5 py-0.5">
          <Mountain className="h-3 w-3 mr-1" />
          <span className="text-xs">{resources.mountain}</span>
        </Badge>
        <Badge variant="outline" className="border-blue-500 text-blue-400 bg-transparent px-1.5 py-0.5">
          <Droplets className="h-3 w-3 mr-1" />
          <span className="text-xs">{resources.water}</span>
        </Badge>
      </div>
      
      {/* Deck and Discard */}
      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
        <div className="flex items-center" title="Deck">
            <Layers className="h-3.5 w-3.5 mr-0.5 text-zinc-400" />
            <span>{deckCount}</span>
        </div>
        <div className="flex items-center" title="Discard Pile">
            <Trash2 className="h-3.5 w-3.5 mr-0.5 text-zinc-500" />
            <span>{discardCount}</span>
        </div>
      </div>
    </div>
  );
}
