// app/api/chat/route.js
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Helper to call your MCP server
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_AUTH_TOKEN = process.env.MCE_AUTH_TOKEN;

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
      throw new Error(`MCP Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('MCP Server call failed:', error);
    throw error;
  }
}

export async function POST(request) {
  console.log('API route called');
  
  try {
    // Parse the incoming request
    const body = await request.json();
    console.log('Request body:', body);
    
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

    const allMessages = [systemPrompt, ...messages];

    // Non-streaming response (simpler, start with this)
    if (!stream) {
      console.log('Creating non-streaming Claude response...');
      
      const response = await anthropic.messages.create({
        model: 'claude-3-sonnet-20241022',
        max_tokens: 1024,
        messages: allMessages,
      });

      console.log('Claude response received');

      // Check if Claude's response includes any MCE actions
      const content = response.content[0].text;
      
      // Parse for MCE commands (you can make this more sophisticated)
      let mceResult = null;
      if (content.toLowerCase().includes('creating email') || 
          content.toLowerCase().includes('create email')) {
        // Extract email details from Claude's response and create in MCE
        // This is a simplified example
        try {
          mceResult = await callMCPServer('email/create', {
            name: 'Email from AI Chat',
            subject: 'AI Generated Email',
            content: content,
          });
        } catch (error) {
          console.error('MCE creation failed:', error);
        }
      }

      return Response.json({
        content: content,
        mceResult: mceResult,
      });
    }

    // Streaming response (more complex)
    console.log('Creating streaming Claude response...');
    
    const claudeStream = await anthropic.messages.create({
      model: 'claude-3-sonnet-20241022',
      max_tokens: 1024,
      messages: allMessages,
      stream: true,
    });

    // Create a TransformStream to handle the Claude stream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    let fullResponse = '';
    
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // Accumulate the full response for potential MCE actions
        const text = chunk.delta?.text || '';
        if (text) {
          fullResponse += text;
          // Send SSE formatted chunk
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      },
      
      async flush(controller) {
        // After streaming is complete, check for MCE actions
        if (fullResponse.toLowerCase().includes('creating email')) {
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
      }
    });

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
          if (fullResponse.toLowerCase().includes('creating email')) {
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
        } catch (error) {
          controller.error(error);
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
    console.error('API Route Error:', error);
    
    // More detailed error response
    return Response.json(
      { 
        error: error.message,
        details: error.stack,
        timestamp: new Date().toISOString(),
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