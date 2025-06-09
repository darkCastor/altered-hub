
'use client';

// This component is no longer used as its elements are integrated directly into PlayerAreaLayout
// in /src/app/play/[deckId]/page.tsx.
// It can be safely deleted if no other part of the application references it.

// import type { PlayerState } from '@/app/play/[deckId]/page'; // Keeping for reference if needed temporarily
// import { Leaf, Mountain, Droplets, Gem, Layers, Trash2 } from 'lucide-react'; 
// import { Badge } from '@/components/ui/badge';

// interface PlayerResourcesProps {
//   playerState: PlayerState; 
//   isOpponent: boolean;
// }

// Dummy PlayerState to satisfy the props if this component were to be rendered
// This is just to prevent type errors if someone tries to use it without full context.
// const dummyPlayerState: PlayerState = {
//   hand: [],
//   hero: undefined,
//   mana: { current: 0, max: 0 },
//   deckCount: 0,
//   discardCount: 0,
//   expedition: [],
//   landmarks: [],
//   reserve: [],
// };


// export default function PlayerResourcesClient({ playerState = dummyPlayerState, isOpponent }: PlayerResourcesProps) {
//   const { mana, deckCount, discardCount } = playerState;
//   const orderClass = isOpponent ? 'flex-col' : 'flex-col';

//   return (
//     <div className={`flex ${orderClass} items-center justify-between p-1 space-y-1 md:space-y-0 md:flex-row md:space-x-2 bg-black/10 rounded`}>
//       {/* Mana Display */}
//       <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-700/50 rounded-md">
//         <Gem className="h-4 w-4 text-primary" />
//         <span className="text-sm font-semibold">{mana.current}/{mana.max}</span>
//         <span className="text-xs text-muted-foreground">MANA</span>
//       </div>
      
//       {/* Deck and Discard */}
//       <div className="flex items-center space-x-2 text-xs text-muted-foreground">
//         <div className="flex items-center" title="Deck">
//             <Layers className="h-3.5 w-3.5 mr-0.5 text-zinc-400" />
//             <span>{deckCount}</span>
//         </div>
//         <div className="flex items-center" title="Discard Pile">
//             <Trash2 className="h-3.5 w-3.5 mr-0.5 text-zinc-500" />
//             <span>{discardCount}</span>
//         </div>
//       </div>
//     </div>
//   );
// }

export default function PlayerResourcesClient() {
  // This component is deprecated and its contents moved. Returning null.
  return null;
}

