import './globals.css';

export const metadata = {
  title: 'MCE Email Builder',
  description: 'Create marketing emails with AI assistance',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}