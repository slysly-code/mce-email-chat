// app/chat/route.js - WITH CORRECT MODEL NAME
import { Anthropic } from '@anthropic-ai/sdk';

// Helper to call your MCP server
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
    return data;

  } catch (error) {
    console.error('❌ MCE call failed:', error);
    return { 
      error: 'MCE connection failed',
      details: error.message
    };
  }
}

export async function POST(request) {
  console.log('Chat route called at:', new Date().toISOString());
  
  if (!process.env.CLAUDE_API_KEY) {
    return Response.json(
      { error: 'Claude API key is not configured' },
      { status: 500 }
    );
  }

  // Use models that are known to work
  const WORKING_MODELS = [
    'claude-3-5-sonnet-latest',    // Try latest alias
    'claude-3-sonnet-20240229',    // Stable older version
    'claude-3-haiku-20240307',     // Fast model
    'claude-2.1',                  // Fallback to Claude 2
  ];
  
  let modelToUse = process.env.CLAUDE_MODEL;
  let anthropic;
  
  try {
    anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    const body = await request.json();
    const { messages, stream = false } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
    When a user asks to create an email, respond with details about what you're creating.
    Format your response with:
    Name: [email name]
    Subject: [email subject]
    Content: [email content description]`;

    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    let response;
    let lastError;
    
    // If no model specified, try working models
    if (!modelToUse) {
      for (const model of WORKING_MODELS) {
        try {
          console.log(`Trying model: ${model}`);
          response = await anthropic.messages.create({
            model: model,
            max_tokens: 1024,
            messages: formattedMessages,
            system: systemPrompt,
          });
          modelToUse = model;
          console.log(`✅ Using model: ${model}`);
          break;
        } catch (error) {
          console.log(`Model ${model} failed:`, error.message);
          lastError = error;
          continue;
        }
      }
      
      if (!response && lastError) {
        throw lastError;
      }
    } else {
      // Use specified model
      response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
      });
    }

    const content = response.content[0]?.text || 'No response generated';
    console.log('Claude responded, checking for email creation...');
    
    let mceResult = null;
    
    // Check if we should create an email
    const shouldCreate = 
      content.toLowerCase().includes('name:') && 
      content.toLowerCase().includes('subject:') &&
      (content.toLowerCase().includes('creating') || 
       content.toLowerCase().includes('i will create') ||
       content.toLowerCase().includes("i'll create"));
    
    if (shouldCreate) {
      console.log('📧 Creating email in MCE...');
      
      // Extract details from Claude's response
      const nameMatch = content.match(/Name:\s*([^\n]+)/i);
      const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
      
      const emailName = nameMatch ? nameMatch[1].trim() : `AI Email ${Date.now()}`;
      const emailSubject = subjectMatch ? subjectMatch[1].trim() : 'Marketing Email';
      
      if (process.env.MCE_API_KEY) {
        mceResult = await callMCPServer('email/create', {
          name: emailName,
          subject: emailSubject,
          template: 'custom',
          content: {
            headline: emailSubject,
            message: content,
            nlpCommand: content
          }
        });
      } else {
        mceResult = {
          error: 'MCE_API_KEY not configured'
        };
      }
    }

    return Response.json({
      content: content,
      mceResult: mceResult,
      model: modelToUse,
    });

  } catch (error) {
    console.error('Route error:', error);
    return Response.json(
      { 
        error: error.message,
        details: 'Model issue - try setting CLAUDE_MODEL env var to claude-3-sonnet-20240229',
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