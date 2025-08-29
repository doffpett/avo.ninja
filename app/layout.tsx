export const metadata = { title: 'avo.ninja' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
