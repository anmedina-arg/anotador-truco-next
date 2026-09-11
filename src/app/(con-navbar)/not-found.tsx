export default function NotFoundConNavbar() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p>No encontramos esta página.</p>
      <a href="/" className="underline">
        Volver al inicio
      </a>
    </main>
  );
}
