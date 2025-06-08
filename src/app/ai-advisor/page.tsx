import DeckAdvisorClient from '@/components/ai/DeckAdvisorClient';

export default function AiAdvisorPage() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">AI Deck Advisor</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Leverage AI to get expert advice on completing your Altered TCG decks.
        </p>
      </section>
      <DeckAdvisorClient />
    </div>
  );
}
