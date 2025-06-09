
'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface GameLogProps {
  messages: string[];
}

export default function GameLogClient({ messages }: GameLogProps) {
  return (
    <Card className="w-full md:w-64 lg:w-80 h-full flex flex-col bg-zinc-900 border-l border-zinc-700 rounded-none shadow-lg">
      <CardHeader className="p-3 border-b border-zinc-700">
        <CardTitle className="text-base flex items-center">
          <MessageSquare className="h-4 w-4 mr-2 text-primary" />
          Game Log
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <ScrollArea className="h-full p-2">
          {messages.length === 0 && <p className="text-xs text-muted-foreground italic p-2">No game events yet.</p>}
          {messages.map((msg, index) => (
            <div key={index} className="text-xs text-muted-foreground mb-1.5 p-1.5 bg-zinc-800/50 rounded-sm">
              {msg}
            </div>
          ))}
        </ScrollArea>
      </CardContent>
      {/* Chat input placeholder - can be added later */}
      <div className="p-2 border-t border-zinc-700">
        <input type="text" placeholder="Chat at this table (disabled)" className="w-full bg-zinc-800 text-xs p-1.5 rounded-sm border border-zinc-700 placeholder-zinc-500" disabled />
      </div>
    </Card>
  );
}
