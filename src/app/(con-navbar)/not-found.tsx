export default function NotFoundConNavbar() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-ink">No encontramos esta página.</p>
      <a href="/" className="font-bold text-accent no-underline hover:text-accent-dark">
        Volver al inicio
      </a>
    </main>
  );
}
