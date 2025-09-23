// app/chat/route.js - WITH FULL DEBUG LOGGING
import { Anthropic } from '@anthropic-ai/sdk';

// Helper to call your MCP server
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_API_KEY = process.env.MCE_API_KEY;

  console.log('=== MCE API CALL DEBUG ===');
  console.log('URL:', `${MCE_SERVER_URL}/api/${action}`);
  console.log('Has API Key:', !!MCE_API_KEY);
  console.log('API Key first 10 chars:', MCE_API_KEY?.substring(0, 10) + '...');
  console.log('Params:', JSON.stringify(params, null, 2));

  if (!MCE_API_KEY) {
    console.error('❌ MCE_API_KEY is not set!');
    return { 
      error: 'MCE configuration missing',
      details: 'MCE_API_KEY not configured'
    };
  }

  try {
    const url = `${MCE_SERVER_URL}/api/${action}`;
    
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MCE_API_KEY,
      },
      body: JSON.stringify(params),
    };
    
    console.log('Request headers:', requestOptions.headers);
    
    const response = await fetch(url, requestOptions);
    
    console.log('MCE Response Status:', response.status);
    console.log('MCE Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('MCE Response Body:', responseText);

    if (!response.ok) {
      return { 
        error: `MCE Server error: ${response.status}`,
        details: responseText
      };
    }

    try {
      const data = JSON.parse(responseText);
      console.log('✅ MCE call successful, parsed data:', data);
      return data;
    } catch (e) {
      console.log('✅ MCE call successful, raw response:', responseText);
      return { success: true, response: responseText };
    }

  } catch (error) {
    console.error('❌ MCE Server call failed:', error.message);
    console.error('Full error:', error);
    return { 
      error: 'MCE connection failed',
      details: error.message
    };
  }
}

export async function POST(request) {
  console.log('=== CHAT ROUTE CALLED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Environment vars check:');
  console.log('- CLAUDE_API_KEY exists:', !!process.env.CLAUDE_API_KEY);
  console.log('- MCE_API_KEY exists:', !!process.env.MCE_API_KEY);
  console.log('- MCE_SERVER_URL:', process.env.MCE_SERVER_URL || 'using default');
  
  if (!process.env.CLAUDE_API_KEY) {
    return Response.json(
      { error: 'Claude API key is not configured' },
      { status: 500 }
    );
  }

  const modelToUse = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    const body = await request.json();
    console.log('Request received, message count:', body.messages?.length);
    
    const { messages, stream = false } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
    When a user asks to create an email, respond with "I'll create an email for you" and then describe what you're creating.
    Be clear when you're actually creating an email vs just discussing it.`;

    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    if (!stream) {
      console.log('Creating non-streaming Claude response...');
      
      const response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
      });

      const content = response.content[0]?.text || 'No response generated';
      console.log('Claude response received, length:', content.length);
      console.log('First 200 chars of response:', content.substring(0, 200));
      
      // ALWAYS try to create email if the word "email" is mentioned
      // This is for debugging - remove once working
      let mceResult = null;
      
      if (content.toLowerCase().includes('email')) {
        console.log('📧 EMAIL KEYWORD DETECTED - ATTEMPTING MCE CREATION');
        
        if (process.env.MCE_API_KEY) {
          const testEmail = {
            name: `Test Email - ${new Date().toLocaleString()}`,
            subject: 'Test Email from Chat',
            template: 'custom',
            content: {
              headline: 'Test Email',
              message: 'This is a test email created from the chat interface.',
              nlpCommand: content
            }
          };
          
          console.log('Creating email with params:', testEmail);
          
          mceResult = await callMCPServer('email/create', testEmail);
          
          console.log('MCE Result:', JSON.stringify(mceResult, null, 2));
        } else {
          console.log('❌ Cannot create email - MCE_API_KEY not found');
          mceResult = {
            error: 'MCE_API_KEY not configured',
            debug: true
          };
        }
      } else {
        console.log('No email keyword found in response');
      }

      return Response.json({
        content: content,
        mceResult: mceResult,
        model: modelToUse,
        debug: {
          hasEmailKeyword: content.toLowerCase().includes('email'),
          hasMCEKey: !!process.env.MCE_API_KEY,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Streaming response (simplified for debugging)
    console.log('Streaming not used in debug mode');
    return Response.json({
      error: 'Streaming disabled for debugging',
      suggestion: 'Use non-streaming mode'
    });

  } catch (error) {
    console.error('=== ROUTE ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return Response.json(
      { 
        error: error.message || 'Internal server error',
        details: error.stack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}