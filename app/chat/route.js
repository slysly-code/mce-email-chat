// app/chat/route.js
import { Anthropic } from '@anthropic-ai/sdk';

// Model preferences (partial matches, in order of preference)
const MODEL_PREFERENCES = [
  'claude-3-5-sonnet',  // Latest Sonnet 3.5
  'claude-3-sonnet',    // Any Sonnet
  'claude-3-opus',      // Most capable
  'claude-3-haiku',     // Fastest
  'claude',             // Any Claude model as last resort
];

// Cache the working model to avoid checking every time
let cachedModel = null;
let lastModelCheck = null;
const MODEL_CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Function to select the best available model
async function selectBestModel(anthropic) {
  // Check if we have a recent cached model
  const now = Date.now();
  if (cachedModel && lastModelCheck && (now - lastModelCheck < MODEL_CACHE_DURATION)) {
    console.log('Using cached model:', cachedModel);
    return cachedModel;
  }

  console.log('Selecting best available Claude model...');
  
  // Since Anthropic SDK doesn't provide a list models endpoint,
  // we'll use a smart fallback approach
  const fallbackModels = [
    'claude-3-5-sonnet-latest',  // Try "latest" alias first
    'claude-3-5-sonnet-20240620', // Known stable version
    'claude-3-sonnet-20240229',   // Older stable version
    'claude-3-haiku-20240307',    // Fast fallback
  ];

  // First, try common model aliases
  for (const model of fallbackModels) {
    try {
      console.log(`Testing model: ${model}`);
      
      // Try a minimal API call to test if the model exists
      await anthropic.messages.create({
        model: model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
      
      console.log(`✅ Model ${model} is available`);
      cachedModel = model;
      lastModelCheck = now;
      return model;
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`Model ${model} not found, trying next...`);
        continue;
      } else if (error.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.status === 429) {
        // Rate limited on test, but model exists
        console.log(`Model ${model} exists (rate limited on test)`);
        cachedModel = model;
        lastModelCheck = now;
        return model;
      }
      // For other errors, continue to next model
      console.log(`Model ${model} error: ${error.message}`);
    }
  }
  
  throw new Error('No available Claude models found. Please check your API key.');
}

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

  // Allow model override via environment variable
  const OVERRIDE_MODEL = process.env.CLAUDE_MODEL;
  
  try {
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });

    // Select model to use
    let modelToUse;
    
    if (OVERRIDE_MODEL) {
      // If there's an environment variable override, use it
      console.log('Using model from environment variable:', OVERRIDE_MODEL);
      modelToUse = OVERRIDE_MODEL;
    } else {
      // Otherwise, auto-detect the best available model
      try {
        modelToUse = await selectBestModel(anthropic);
        console.log('Auto-selected model:', modelToUse);
      } catch (modelError) {
        console.error('Model selection failed:', modelError);
        
        return Response.json(
          { 
            error: 'Model selection failed',
            details: modelError.message,
            suggestion: 'You can set CLAUDE_MODEL environment variable to specify a model directly'
          },
          { status: 500 }
        );
      }
    }

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
    const systemPrompt = `You are an AI assistant that helps create marketing emails and journeys in Salesforce Marketing Cloud Engagement. 
    You can create emails, build journeys, and manage data extensions. 
    When a user asks to create an email, describe what you would create and ask for confirmation before actually creating it in MCE.
    You have access to a Marketing Cloud instance through API calls.`;

    // Ensure messages are in the correct format for Claude
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    // Non-streaming response
    if (!stream) {
      console.log(`Creating non-streaming response with model: ${modelToUse}`);
      
      try {
        const response = await anthropic.messages.create({
          model: modelToUse,
          max_tokens: 1024,
          messages: formattedMessages,
          system: systemPrompt,
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
          model: modelToUse,
        });

      } catch (claudeError) {
        console.error('Claude API error:', claudeError);
        
        // If model doesn't exist, clear cache and suggest retry
        if (claudeError.status === 404) {
          cachedModel = null;
          lastModelCheck = null;
          
          return Response.json(
            { 
              error: 'Model not found',
              details: `Model ${modelToUse} is not available`,
              suggestion: 'Try again (will auto-select a different model) or set CLAUDE_MODEL env variable'
            },
            { status: 500 }
          );
        }
        
        // Check for other common errors
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
              details: claudeError.message || 'Unknown error occurred',
              model: modelToUse
            },
            { status: 500 }
          );
        }
      }
    }

    // Streaming response
    console.log(`Creating streaming response with model: ${modelToUse}`);
    
    try {
      const claudeStream = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
        stream: true,
      });

      const encoder = new TextEncoder();
      let fullResponse = '';
      
      // Create the streaming response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Send model info at the start
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: modelToUse })}\n\n`));
            
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
      
      // Clear cache on 404
      if (claudeError.status === 404) {
        cachedModel = null;
        lastModelCheck = null;
      }
      
      return Response.json(
        { 
          error: 'Claude streaming error',
          details: claudeError.message || 'Unknown error occurred',
          model: modelToUse
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
          modelOverride: process.env.CLAUDE_MODEL || 'none',
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