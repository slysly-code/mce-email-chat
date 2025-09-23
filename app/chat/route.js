// app/chat/route.js
import { Anthropic } from '@anthropic-ai/sdk';

// Helper to call your MCP server
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_AUTH_TOKEN = process.env.MCE_AUTH_TOKEN;

  if (!MCE_AUTH_TOKEN) {
    console.error('MCE_AUTH_TOKEN is not set');
    return { error: 'MCE configuration missing' };
  }

  try {
    const response = await fetch(`${MCE_SERVER_URL}/api/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCE_AUTH_TOKEN}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error(`MCP Server error: ${response.status}`);
      return { error: `MCP Server error: ${response.status}` };
    }

    return await response.json();
  } catch (error) {
    console.error('MCP Server call failed:', error);
    return { error: error.message };
  }
}

export async function POST(request) {
  console.log('Chat API route called at:', new Date().toISOString());
  
  // Check if Claude API key is set
  if (!process.env.CLAUDE_API_KEY) {
    console.error('CLAUDE_API_KEY is not set in environment variables');
    return Response.json(
      { 
        error: 'Claude API key is not configured',
        details: 'Please set CLAUDE_API_KEY in Vercel environment variables'
      },
      { status: 500 }
    );
  }

  try {
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });

    // Parse the incoming request
    const body = await request.json();
    console.log('Request received with messages count:', body.messages?.length);
    
    const { messages, stream = false } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Add system prompt for MCE context
    const systemPrompt = {
      role: 'system',
      content: `You are an AI assistant that helps create marketing emails and journeys in Salesforce Marketing Cloud Engagement. 
      You can create emails, build journeys, and manage data extensions. 
      When a user asks to create an email, describe what you would create and ask for confirmation before actually creating it in MCE.
      You have access to a Marketing Cloud instance through API calls.`
    };

    // Ensure messages are in the correct format for Claude
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    const allMessages = [systemPrompt, ...formattedMessages];

    // Non-streaming response
    if (!stream) {
      console.log('Creating non-streaming Claude response...');
      
      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-sonnet-20241022',
          max_tokens: 1024,
          messages: allMessages.filter(m => m.role !== 'system'), // Remove system for messages array
          system: systemPrompt.content, // Add system content separately
        });

        console.log('Claude response received successfully');

        // Extract the response content
        const content = response.content[0]?.text || 'No response generated';
        
        // Check if Claude's response includes any MCE actions
        let mceResult = null;
        if (content.toLowerCase().includes('creating email') || 
            content.toLowerCase().includes('create email')) {
          // Only try to create in MCE if auth token is set
          if (process.env.MCE_AUTH_TOKEN) {
            try {
              mceResult = await callMCPServer('email/create', {
                name: 'Email from AI Chat',
                subject: 'AI Generated Email',
                content: content,
              });
            } catch (error) {
              console.error('MCE creation failed:', error);
              mceResult = { error: 'MCE creation failed', details: error.message };
            }
          }
        }

        return Response.json({
          content: content,
          mceResult: mceResult,
        });

      } catch (claudeError) {
        console.error('Claude API error:', claudeError);
        
        // Check for common Claude API errors
        if (claudeError.status === 401) {
          return Response.json(
            { 
              error: 'Invalid Claude API key',
              details: 'Please check your CLAUDE_API_KEY in Vercel settings'
            },
            { status: 500 }
          );
        } else if (claudeError.status === 429) {
          return Response.json(
            { 
              error: 'Rate limit exceeded',
              details: 'Too many requests to Claude API. Please wait a moment.'
            },
            { status: 429 }
          );
        } else {
          return Response.json(
            { 
              error: 'Claude API error',
              details: claudeError.message || 'Unknown error occurred'
            },
            { status: 500 }
          );
        }
      }
    }

    // Streaming response
    console.log('Creating streaming Claude response...');
    
    try {
      const claudeStream = await anthropic.messages.create({
        model: 'claude-3-sonnet-20241022',
        max_tokens: 1024,
        messages: allMessages.filter(m => m.role !== 'system'),
        system: systemPrompt.content,
        stream: true,
      });

      const encoder = new TextEncoder();
      let fullResponse = '';
      
      // Create the streaming response
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
            
            // Check for MCE actions after stream completes
            if (fullResponse.toLowerCase().includes('creating email') && process.env.MCE_AUTH_TOKEN) {
              try {
                const mceResult = await callMCPServer('email/create', {
                  name: 'Email from AI Chat',
                  subject: 'AI Generated Email',
                  content: fullResponse,
                });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mceResult })}\n\n`));
              } catch (error) {
                console.error('MCE action failed:', error);
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

    } catch (claudeError) {
      console.error('Claude streaming error:', claudeError);
      return Response.json(
        { 
          error: 'Claude streaming error',
          details: claudeError.message || 'Unknown error occurred'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API Route Error:', error);
    console.error('Error stack:', error.stack);
    
    // Return detailed error for debugging
    return Response.json(
      { 
        error: error.message || 'Internal server error',
        details: error.stack || 'No stack trace available',
        timestamp: new Date().toISOString(),
        env: {
          hasClaudeKey: !!process.env.CLAUDE_API_KEY,
          hasMCEToken: !!process.env.MCE_AUTH_TOKEN,
          hasMCEUrl: !!process.env.MCE_SERVER_URL,
        }
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
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