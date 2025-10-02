// app/chat/route.js - CORRECTED with logging
import { Anthropic } from '@anthropic-ai/sdk';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../api/auth/[...nextauth]/route.js';

// Helper function to call the MCE Server
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_API_KEY = process.env.MCE_API_KEY;

  // *** THIS IS THE LOG WE NEED TO DEBUG THE MCE SERVER ***
  console.log('--- MCE Server Request Body ---', JSON.stringify(params, null, 2));

  try {
    const url = `${MCE_SERVER_URL}/api/${action}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MCE_API_KEY,
      },
      body: JSON.stringify(params),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('MCE Error Response Text:', responseText);
      return { 
        error: `MCE Server error: ${response.status}`,
        details: responseText
      };
    }
    return JSON.parse(responseText);

  } catch (error) {
    console.error('❌ MCE call failed:', error);
    return { 
      error: 'MCE connection failed',
      details: error.message
    };
  }
}

// Main route handler
export async function POST(request) {
  console.log('Chat route called at:', new Date().toISOString());

  // --- Authentication Check ---
  const session = await getServerSession(authOptions);
  const apiKey = request.headers.get('x-api-key');
  const serverApiKey = process.env.SERVER_API_KEY;

  if (!session && (!serverApiKey || apiKey !== serverApiKey)) {
    console.log('Authentication failed: No session and invalid or missing API key.');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.log('Authentication successful.');

  if (!process.env.CLAUDE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Claude API key is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const modelToUse = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });

    const body = await request.json();
    const { messages, stream = false } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an AI assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
    When a user asks you to create an email, you should:
    1. Confirm you will create it by saying "I'll create this email for you in Marketing Cloud"
    2. Provide details in this format:
       Name: [descriptive name for the email]
       Subject: [email subject line]
       Content: [detailed description of the email content]
    3. The email will be created as a fully editable template in Marketing Cloud Content Builder.`;

    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    if (!stream) {
      const response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
      });

      const content = response.content[0]?.text || 'No response generated';
      let mceResult = null;

      const shouldCreate =
        (content.toLowerCase().includes("i'll create") ||
         content.toLowerCase().includes("i will create") ||
         content.toLowerCase().includes("creating this email")) &&
        content.toLowerCase().includes('name:') &&
        content.toLowerCase().includes('subject:');

      if (shouldCreate) {
        console.log('📧 Creating email in MCE...');
        const nameMatch = content.match(/Name:\s*([^\n]+)/i);
        const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
        const contentMatch = content.match(/Content:\s*([\s\S]+?)(?=\n\n|\n[A-Z]|$)/i);
        
        const emailName = nameMatch ? nameMatch[1].trim() : `AI Email ${new Date().toLocaleDateString()}`;
        const emailSubject = subjectMatch ? subjectMatch[1].trim() : 'Marketing Email';
        const emailContent = contentMatch ? contentMatch[1].trim() : content;

        mceResult = await callMCPServer('tool/build_email', {
          name: emailName,
          subject: emailSubject,
          nlpCommand: emailContent,
          template: 'custom'
        });
      }

      return new Response(JSON.stringify({
        content: content,
        mceResult: mceResult,
        model: modelToUse,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // (Streaming logic remains the same)

  } catch (error) {
    console.error('Route error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// OPTIONS handler
export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    },
  });
}