// app/chat/route.js - Fixed MCE Integration
import { Anthropic } from '@anthropic-ai/sdk';

// Helper to call your MCP server with correct authentication
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_API_KEY = process.env.MCE_API_KEY; // Changed from MCE_AUTH_TOKEN!

  console.log('=== MCE API CALL ===');
  console.log('MCE_SERVER_URL:', MCE_SERVER_URL);
  console.log('Action:', action);
  console.log('Has MCE_API_KEY:', !!MCE_API_KEY);

  if (!MCE_API_KEY) {
    console.error('❌ MCE_API_KEY is not set!');
    return { 
      error: 'MCE configuration missing',
      details: 'MCE_API_KEY not configured in environment variables'
    };
  }

  try {
    const url = `${MCE_SERVER_URL}/api/${action}`;
    console.log('Calling MCE endpoint:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MCE_API_KEY, // Correct header format!
      },
      body: JSON.stringify(params),
    });

    console.log('MCE Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ MCE Server error: ${response.status}`, errorText);
      return { 
        error: `MCE Server error: ${response.status}`,
        details: errorText
      };
    }

    const data = await response.json();
    console.log('✅ MCE call successful:', data);
    return data;

  } catch (error) {
    console.error('❌ MCE Server call failed:', error);
    return { 
      error: 'MCE connection failed',
      details: error.message
    };
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

  // Log MCE configuration status
  console.log('MCE Configuration:');
  console.log('- MCE_SERVER_URL:', process.env.MCE_SERVER_URL || 'Using default');
  console.log('- Has MCE_API_KEY:', !!process.env.MCE_API_KEY);

  const modelToUse = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
  
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

    // System prompt that explains MCE capabilities
    const systemPrompt = `You are an AI assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
    
    When a user asks to create an email, you should:
    1. Understand what they want to create
    2. Generate a detailed description of the email
    3. Create it in Marketing Cloud using the proper format
    
    For creating emails, use this format in your response:
    - Name: [A descriptive name for the email]
    - Subject: [The email subject line]
    - Content: [A detailed description of what the email should contain]
    
    The email will be created as a fully editable template in Marketing Cloud Content Builder.
    
    You can also list existing emails, send emails, and manage data extensions.`;

    // Format messages for Claude
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
      content: String(msg.content || '')
    }));

    // Non-streaming response
    if (!stream) {
      console.log(`Creating non-streaming response with model: ${modelToUse}`);
      
      const response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        messages: formattedMessages,
        system: systemPrompt,
      });

      const content = response.content[0]?.text || 'No response generated';
      console.log('Claude response received');
      
      // Check if Claude wants to create an email
      let mceResult = null;
      
      // Look for email creation intent
      if (content.toLowerCase().includes('creating') && 
          content.toLowerCase().includes('email') &&
          !content.toLowerCase().includes('would create') &&
          !content.toLowerCase().includes('could create')) {
        
        console.log('📧 Creating email in MCE...');
        
        // Extract email details from Claude's response
        // Look for Name:, Subject:, and Content: patterns
        const nameMatch = content.match(/Name:\s*([^\n]+)/i);
        const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
        const contentMatch = content.match(/Content:\s*([^\n]+(?:\n(?!Name:|Subject:).*)*)/is);
        
        const emailName = nameMatch ? nameMatch[1].trim() : `AI Email - ${new Date().toLocaleDateString()}`;
        const emailSubject = subjectMatch ? subjectMatch[1].trim() : 'Marketing Email';
        const emailContent = contentMatch ? contentMatch[1].trim() : content;
        
        if (process.env.MCE_API_KEY) {
          try {
            // Call MCE API with the format it expects
            mceResult = await callMCPServer('email/create', {
              name: emailName,
              subject: emailSubject,
              template: 'custom', // or 'welcome', 'newsletter', etc.
              content: {
                headline: emailSubject,
                message: emailContent,
                // You can add more fields based on the template
                nlpCommand: content // Pass the full AI description for better email generation
              }
            });
            
            console.log('MCE Create Result:', mceResult);
          } catch (error) {
            console.error('MCE creation error:', error);
            mceResult = { 
              error: 'Failed to create email in MCE',
              details: error.message
            };
          }
        } else {
          mceResult = {
            error: 'MCE not configured',
            details: 'Please set MCE_API_KEY in environment variables'
          };
        }
      }

      return Response.json({
        content: content,
        mceResult: mceResult,
        model: modelToUse,
      });

    }

    // Streaming response
    console.log(`Creating streaming response with model: ${modelToUse}`);
    
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: modelToUse })}\n\n`));
          
          for await (const chunk of claudeStream) {
            const text = chunk.delta?.text || '';
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          
          // After streaming completes, check if we should create an email
          if (fullResponse.toLowerCase().includes('creating') && 
              fullResponse.toLowerCase().includes('email') &&
              !fullResponse.toLowerCase().includes('would create')) {
            
            const nameMatch = fullResponse.match(/Name:\s*([^\n]+)/i);
            const subjectMatch = fullResponse.match(/Subject:\s*([^\n]+)/i);
            
            if (process.env.MCE_API_KEY && (nameMatch || subjectMatch)) {
              console.log('📧 Stream complete, creating in MCE...');
              
              const emailName = nameMatch ? nameMatch[1].trim() : `AI Email - ${new Date().toLocaleDateString()}`;
              const emailSubject = subjectMatch ? subjectMatch[1].trim() : 'Marketing Email';
              
              try {
                const mceResult = await callMCPServer('email/create', {
                  name: emailName,
                  subject: emailSubject,
                  template: 'custom',
                  content: {
                    headline: emailSubject,
                    message: fullResponse,
                    nlpCommand: fullResponse
                  }
                });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mceResult })}\n\n`));
              } catch (error) {
                const errorResult = { 
                  error: 'MCE creation failed',
                  details: error.message
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mceResult: errorResult })}\n\n`));
              }
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
    console.error('API Route Error:', error);
    
    return Response.json(
      { 
        error: error.message || 'Internal server error',
        details: error.stack || 'No stack trace available',
        timestamp: new Date().toISOString(),
        env: {
          hasClaudeKey: !!process.env.CLAUDE_API_KEY,
          hasMCEKey: !!process.env.MCE_API_KEY,
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