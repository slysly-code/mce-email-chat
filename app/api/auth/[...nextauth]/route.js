// app/api/auth/[...nextauth]/route.js
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';

const authOptions = {
  providers: [
    // Option 1: Google OAuth (if configured)
    ...(process.env.GOOGLE_CLIENT_ID ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        authorization: {
          params: {
            prompt: "consent",
            access_type: "offline",
            response_type: "code"
          }
        }
      })
    ] : []),
    
    // Option 2: GitHub OAuth (if configured)
    ...(process.env.GITHUB_CLIENT_ID ? [
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      })
    ] : []),
    
    // Option 3: Simple email/password (always available for testing)
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Check against environment variables
        const validEmail = process.env.ADMIN_EMAIL || 'admin@test.com';
        const validPassword = process.env.ADMIN_PASSWORD || 'password123';
        
        console.log('Login attempt:', credentials?.email);
        
        if (credentials?.email === validEmail && credentials?.password === validPassword) {
          console.log('Login successful for:', validEmail);
          return {
            id: '1',
            email: credentials.email,
            name: 'Admin User',
          };
        }
        
        // Check authorized users list
        const authorizedUsers = process.env.AUTHORIZED_EMAILS?.split(',') || [];
        if (authorizedUsers.includes(credentials?.email) && credentials?.password === validPassword) {
          return {
            id: credentials.email,
            email: credentials.email,
            name: credentials.email.split('@')[0],
          };
        }
        
        console.log('Login failed for:', credentials?.email);
        return null;
      }
    }),
  ],
  
  callbacks: {
    async signIn({ user, account, profile }) {
      // Optional: Restrict to specific email domains or addresses
      const allowedEmails = process.env.ALLOWED_EMAILS?.split(',') || [];
      const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [];
      
      // If no restrictions are set, allow all
      if (allowedEmails.length === 0 && allowedDomains.length === 0) {
        return true;
      }
      
      // Check if email is in allowed list
      if (allowedEmails.length > 0 && allowedEmails.includes(user.email)) {
        return true;
      }
      
      // Check if domain is allowed
      const domain = user.email?.split('@')[1];
      if (allowedDomains.length > 0 && allowedDomains.includes(domain)) {
        return true;
      }
      
      return false; // Reject sign in
    },
    
    async session({ session, token }) {
      // Add user ID to session
      if (session?.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    }
  },
  
  // REMOVED custom pages - use default NextAuth pages
  // pages: {
  //   signIn: '/auth/signin',  // These don't exist!
  //   error: '/auth/error',
  // },
  
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
  
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  debug: true, // Enable debug messages in development
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };