// app/chat/route.js - With API Key Authentication
import { Anthropic } from '@anthropic-ai/sdk';
import { getServerSession } from "next-auth/next";
// Make sure you have authOptions exported from your [...nextauth]/route.js file
// If you don't, you'll need to define them here or import them correctly.
// For this example, I'm assuming you have an export like `export const authOptions = { ... }`
import { authOptions } from '../api/auth/[...nextauth]/route.js';

// Helper function - NO await here
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_API_KEY = process.env.MCE_API_KEY;

  console.log('=== MCE API CALL ===');
  console.log('URL:', `${MCE_SERVER_URL}/api/${action}`);
  console.log('Has API Key:', !!MCE_API_KEY);

  if (!MCE_API_KEY) {
    console.error('❌ MCE_API_KEY is not set!');
    return {
      error: 'MCE configuration missing',
      details: 'MCE_API_KEY not configured'
    };
  }

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

    console.log('MCE Response Status:', response.status);
    const responseText = await response.text();

    if (!response.ok) {
      console.error('MCE Error:', responseText);
      return {
        error: `MCE Server error: ${response.status}`,
        details: responseText
      };
    }

    const data = JSON.parse(responseText);
    console.log('✅ MCE Success:', data);

    // Extract the actual result if it's wrapped
    if (data.result) {
      try {
        return JSON.parse(data.result);
      } catch {
        return data;
      }
    }

    return data;

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

  // --- START: API Key and Session Authentication ---
  const session = await getServerSession(authOptions);
  const apiKey = request.headers.get('x-api-key'); // Headers are case-insensitive
  const serverApiKey = process.env.SERVER_API_KEY;

  // Authenticate request: Must have a valid session OR a valid API key
  if (!session && (!serverApiKey || apiKey !== serverApiKey)) {
    console.log('Authentication failed: No session and invalid or missing API key.');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.log('Authentication successful.');
  // --- END: Authentication ---

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
    console.log('Request received with', body.messages?.length, 'messages');

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
      console.log(`Using model: ${modelToUse}`);

      const response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
      });

      const content = response.content[0]?.text || 'No response generated';
      console.log('Claude responded successfully');

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

        if (process.env.MCE_API_KEY) {
          mceResult = await callMCPServer('tool/build_email', {
            name: emailName,
            subject: emailSubject,
            nlpCommand: emailContent,
            template: 'custom'
          });

          console.log('MCE Result:', mceResult);
        } else {
          mceResult = {
            error: 'MCE_API_KEY not configured',
            details: 'Please set MCE_API_KEY in environment variables'
          };
        }
      } else {
        console.log('Not creating email - response appears to be informational only');
      }

      return new Response(JSON.stringify({
        content: content,
        mceResult: mceResult,
        model: modelToUse,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Streaming response
    console.log('Creating streaming response...');

    const claudeStream = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 1024,
      messages: formattedMessages,
      system: systemPrompt,
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of claudeStream) {
            const text = chunk.delta?.text || '';
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          const shouldCreate =
            (fullResponse.toLowerCase().includes("i'll create") ||
             fullResponse.toLowerCase().includes("i will create")) &&
            fullResponse.toLowerCase().includes('name:') &&
            fullResponse.toLowerCase().includes('subject:');

          if (shouldCreate && process.env.MCE_API_KEY) {
            console.log('📧 Stream complete, creating in MCE...');

            const nameMatch = fullResponse.match(/Name:\s*([^\n]+)/i);
            const subjectMatch = fullResponse.match(/Subject:\s*([^\n]+)/i);

            if (nameMatch && subjectMatch) {
              const mceResult = await callMCPServer('tool/build_email', {
                name: nameMatch[1].trim(),
                subject: subjectMatch[1].trim(),
                nlpCommand: fullResponse,
                template: 'custom'
              });
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mceResult })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Route error:', error);

    if (error.message?.includes('not_found_error')) {
      return new Response(
        JSON.stringify({
          error: 'Claude model not found',
          details: `Model ${modelToUse} is not available.`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      }),
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