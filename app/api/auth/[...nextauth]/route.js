// app/api/test/route.js - Simple test route
export async function GET(request) {
  return Response.json({
    message: 'API routes are working!',
    timestamp: new Date().toISOString(),
    env: {
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasAdminEmail: !!process.env.ADMIN_EMAIL,
      nodeEnv: process.env.NODE_ENV,
    }
  });
}