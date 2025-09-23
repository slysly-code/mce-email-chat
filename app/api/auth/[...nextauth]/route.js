// app/api/auth/[...nextauth]/route.js - With Debug Logging
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Debug logging
        console.log('=== AUTH DEBUG ===');
        console.log('Login attempt for:', credentials?.email);
        console.log('ADMIN_EMAIL from env:', process.env.ADMIN_EMAIL);
        console.log('Has ADMIN_PASSWORD:', !!process.env.ADMIN_PASSWORD);
        console.log('Password length provided:', credentials?.password?.length);
        
        // Get credentials from environment
        const validEmail = process.env.ADMIN_EMAIL;
        const validPassword = process.env.ADMIN_PASSWORD;
        
        // Check if environment variables are set
        if (!validEmail || !validPassword) {
          console.error('❌ ADMIN_EMAIL or ADMIN_PASSWORD not set in environment variables!');
          console.log('ADMIN_EMAIL exists:', !!validEmail);
          console.log('ADMIN_PASSWORD exists:', !!validPassword);
          return null;
        }
        
        // Check credentials
        const emailMatch = credentials?.email === validEmail;
        const passwordMatch = credentials?.password === validPassword;
        
        console.log('Email match:', emailMatch);
        console.log('Password match:', passwordMatch);
        
        if (emailMatch && passwordMatch) {
          console.log('✅ Login successful for:', validEmail);
          return {
            id: '1',
            email: credentials.email,
            name: 'Admin User',
          };
        }
        
        // Check authorized users list (with same password)
        const authorizedUsers = process.env.AUTHORIZED_EMAILS?.split(',').map(e => e.trim()) || [];
        console.log('Authorized users:', authorizedUsers);
        
        if (authorizedUsers.includes(credentials?.email) && passwordMatch) {
          console.log('✅ Authorized user login:', credentials.email);
          return {
            id: credentials.email,
            email: credentials.email,
            name: credentials.email.split('@')[0],
          };
        }
        
        console.log('❌ Login failed - invalid credentials');
        return null;
      }
    }),
  ],
  
  callbacks: {
    async signIn({ user }) {
      console.log('Sign-in callback for user:', user?.email);
      return true;
    },
    
    async session({ session, token }) {
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
  
  secret: process.env.NEXTAUTH_SECRET,
  
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  
  debug: true, // Enable debug mode
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };