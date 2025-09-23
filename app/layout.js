// app/layout.js
import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'MCE Email Chat',
  description: 'AI-powered chat interface for Salesforce Marketing Cloud',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}