import Link from 'next/link';
import { Package2 } from 'lucide-react'; // Using Package2 as a generic logo icon
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/cards', label: 'Card Viewer' },
  { href: '/decks', label: 'Deck Builder' },
  { href: '/looks', label: 'Look Cards' },
  { href: '/ai-advisor', label: 'AI Deck Advisor' },
  { href: '/ai-look-suggester', label: 'AI Look Suggestion' },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-headline text-lg font-semibold">
          <Package2 className="h-6 w-6 text-primary" />
          <span className="text-foreground">AlterDeck</span>
        </Link>
        <nav className="hidden md:flex items-center space-x-4 lg:space-x-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* Mobile Menu Trigger - Can be implemented later with Sidebar/Sheet */}
        <div className="md:hidden">
          <Button variant="ghost" size="icon">
            {/* Placeholder for Menu Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          </Button>
        </div>
      </div>
    </header>
  );
}
