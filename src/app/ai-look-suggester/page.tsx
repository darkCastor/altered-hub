import LookSuggesterClient from '@/components/ai/LookSuggesterClient';

export default function AiLookSuggesterPage() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">AI Look Suggestion</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Discover perfect card complements for your visual themes with AI-powered insights.
        </p>
      </section>
      <LookSuggesterClient />
    </div>
  );
}
