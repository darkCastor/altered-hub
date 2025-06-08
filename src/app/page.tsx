import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, BookOpen, Lightbulb, Layers } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const features = [
    {
      icon: <BookOpen className="h-8 w-8 text-primary" />,
      title: "Card Viewer",
      description: "Browse and discover all Altered TCG cards with detailed information.",
      href: "/cards",
    },
    {
      icon: <Layers className="h-8 w-8 text-primary" />,
      title: "Deck Builder",
      description: "Craft, save, and manage your custom decks for competitive play or fun.",
      href: "/decks",
    },
    {
      icon: <Lightbulb className="h-8 w-8 text-primary" />,
      title: "AI Deck Advisor",
      description: "Get AI-powered suggestions to complete your decks and optimize strategies.",
      href: "/ai-advisor",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-12">
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-6 text-center">
            <h1 className="font-headline text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              Welcome to AlterDeck
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
              Your ultimate companion for Altered TCG. Explore cards, build powerful decks, and get AI-driven advice.
            </p>
            <div>
              <Link href="/cards">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Explore Cards
                  <Zap className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24">
        <div className="container px-4 md:px-6">
          <h2 className="font-headline text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">
            Features
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="flex flex-col shadow-lg hover:shadow-primary/30 transition-shadow duration-300">
                <CardHeader className="items-center">
                  {feature.icon}
                  <CardTitle className="font-headline mt-4 text-2xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <CardDescription className="text-center">{feature.description}</CardDescription>
                </CardContent>
                <CardContent className="mt-auto">
                  <Link href={feature.href} className="w-full">
                    <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                      Go to {feature.title}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
