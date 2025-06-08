
'use client';

import { useState, useEffect } from 'react';
import { PlusCircle, Trash2, Edit3 } from 'lucide-react';
import type { Look, AlteredCard, LookListItem } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { allCards } from '@/data/cards'; // Updated import
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const LOOK_STORAGE_KEY = 'alterdeck-looks';

export default function LookCardsPage() {
  const [looks, setLooks] = useLocalStorage<Look[]>(LOOK_STORAGE_KEY, []);
  const [isMounted, setIsMounted] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLook, setEditingLook] = useState<Look | null>(null);
  const [lookName, setLookName] = useState('');
  const [lookDescription, setLookDescription] = useState('');
  const [selectedCards, setSelectedCards] = useState<AlteredCard[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openFormForNew = () => {
    setEditingLook(null);
    setLookName('');
    setLookDescription('');
    setSelectedCards([]);
    setIsFormOpen(true);
  };

  const openFormForEdit = (look: Look) => {
    setEditingLook(look);
    setLookName(look.name);
    setLookDescription(look.description || '');
    setSelectedCards([...look.cards]);
    setIsFormOpen(true);
  };

  const handleCardToggle = (card: AlteredCard) => {
    setSelectedCards(prev => {
      const isSelected = prev.find(c => c.id === card.id);
      if (isSelected) {
        return prev.filter(c => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  };

  const handleSubmitLook = () => {
    if (!lookName.trim()) {
      toast({ title: "Error", description: "Look name cannot be empty.", variant: "destructive" });
      return;
    }
    if (selectedCards.length === 0) {
      toast({ title: "Error", description: "A look must contain at least one card.", variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    if (editingLook) {
      const updatedLooks = looks.map(l =>
        l.id === editingLook.id ? { ...editingLook, name: lookName, description: lookDescription, cards: selectedCards, updatedAt: now } : l
      );
      setLooks(updatedLooks);
      toast({ title: "Look Updated", description: `"${lookName}" has been saved.` });
    } else {
      const newLook: Look = {
        id: `look-${Date.now()}`,
        name: lookName,
        description: lookDescription,
        cards: selectedCards,
        createdAt: now,
        updatedAt: now,
      };
      setLooks(prevLooks => [...prevLooks, newLook]);
      toast({ title: "Look Created", description: `"${lookName}" has been added.` });
    }
    setIsFormOpen(false);
  };

  const handleDeleteLook = (lookId: string) => {
    setLooks(looks.filter(l => l.id !== lookId));
    toast({ title: "Look Deleted", description: "The look has been removed." });
  };

  const lookListItems: LookListItem[] = looks.map(look => ({
    id: look.id,
    name: look.name,
    cardCount: look.cards.length,
    updatedAt: look.updatedAt,
    previewImageUrls: look.cards.slice(0, 3).map(c => c.imageUrl).filter(Boolean) as string[],
  })).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!isMounted) {
    return <div className="text-center p-10">Loading looks...</div>;
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">Look Cards</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Curate and showcase visually appealing card combinations.
          </p>
        </div>
        <Button onClick={openFormForNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <PlusCircle className="mr-2 h-5 w-5" /> Create New Look
        </Button>
      </section>

      {looks.length === 0 ? (
        <Card className="text-center py-12 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-muted-foreground">No Looks Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Create your first look to see it here.</p>
            <Button onClick={openFormForNew} variant="outline" className="mt-6 border-primary text-primary hover:bg-primary/10">
              Create Your First Look
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lookListItems.map((look) => (
            <Card key={look.id} className="flex flex-col shadow-lg hover:shadow-primary/30 transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="font-headline text-xl">{look.name}</CardTitle>
                <CardDescription>{look.cardCount} cards in this look</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                {look.previewImageUrls && look.previewImageUrls.length > 0 && (
                  <div className="flex -space-x-4 justify-center my-2">
                    {look.previewImageUrls.map((url, index) => (
                      <Image key={index} src={url} alt={`${look.name} preview ${index + 1}`} width={60} height={84} className="rounded-md border-2 border-background shadow-md object-cover" style={{ zIndex: look.previewImageUrls!.length - index }} data-ai-hint={look.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">Last updated: {new Date(look.updatedAt).toLocaleDateString()}</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                    const fullLook = looks.find(l => l.id === look.id);
                    if (fullLook) openFormForEdit(fullLook);
                  }}>
                  <Edit3 className="mr-1 h-4 w-4" /> Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                     <Button variant="destructive" size="sm">
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the look "{look.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteLook(look.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">{editingLook ? 'Edit Look' : 'Create New Look'}</DialogTitle>
            <DialogDescription>
              {editingLook ? 'Modify your look details and card selection.' : 'Assemble your collection of visually appealing cards.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-grow min-h-0">
            <div className="space-y-4">
              <Input
                placeholder="Look Name"
                value={lookName}
                onChange={(e) => setLookName(e.target.value)}
                className="text-lg"
              />
              <Textarea
                placeholder="Look Description (optional)"
                value={lookDescription}
                onChange={(e) => setLookDescription(e.target.value)}
                rows={3}
              />
              <div>
                <h3 className="font-semibold mb-2">Selected Cards ({selectedCards.length})</h3>
                <ScrollArea className="h-[calc(90vh-400px)] md:h-[calc(90vh-350px)] border rounded-md p-2">
                   {selectedCards.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No cards selected. Add cards from the list on the right to create your look.</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selectedCards.map(card => (
                      <Card key={card.id} className="relative p-1">
                        {card.imageUrl && <Image src={card.imageUrl} alt={card.name} width={100} height={140} className="rounded-sm w-full object-cover" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />}
                        <p className="text-xs font-medium truncate text-center mt-1">{card.name}</p>
                        <Button variant="ghost" size="icon" className="absolute top-0 right-0 bg-background/70 hover:bg-destructive/80" onClick={() => handleCardToggle(card)}>
                          <Trash2 className="h-3 w-3 text-destructive hover:text-destructive-foreground" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="flex flex-col min-h-0">
              <h3 className="font-semibold mb-2">Available Cards</h3>
              <ScrollArea className="h-full border rounded-md p-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {allCards.map(card => ( // Use allCards here
                  <Card 
                    key={card.id} 
                    onClick={() => handleCardToggle(card)}
                    className={`p-2 cursor-pointer transition-all ${selectedCards.find(c => c.id === card.id) ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50'}`}
                  >
                    {card.imageUrl && <Image src={card.imageUrl} alt={card.name} width={80} height={112} className="rounded-sm mx-auto mb-1 object-cover" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />}
                    <p className="text-xs font-medium truncate text-center">{card.name}</p>
                  </Card>
                ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmitLook} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {editingLook ? 'Save Changes' : 'Create Look'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
