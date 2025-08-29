export const metadata = { title: 'avo.ninja' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-amber-300 to-sky-500">{children}</body>
    </html>
  );
}

