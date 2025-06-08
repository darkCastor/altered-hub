export default function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 md:py-8">
      <div className="container flex flex-col items-center justify-center gap-2 text-center md:flex-row md:justify-between">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} AlterDeck. All rights reserved.
        </p>
        <p className="text-sm text-muted-foreground">
          Powered by Firebase Studio & Next.js
        </p>
      </div>
    </footer>
  );
}
