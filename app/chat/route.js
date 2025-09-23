// app/chat/route.js - WITH CLAUDE SONNET 4 latest
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

  // Use Claude Sonnet 4 (latest as of October 2024)
  const modelToUse = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    const body = await request.json();
    console.log('Request received with', body.messages?.length, 'messages');
    
    const { messages, stream = false } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
    
    When a user asks you to create an email, you should:
    1. Confirm you will create it by saying "I'll create this email for you in Marketing Cloud"
    2. Provide details in this format:
       Name: [descriptive name for the email]
       Subject: [email subject line]
       Content: [detailed description of the email content]
    3. The email will be created as a fully editable template in Marketing Cloud Content Builder.
    
    Be clear when you're actually creating an email vs just discussing email ideas.`;

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
      
      // Check if we should create an email in MCE
      const shouldCreate = 
        (content.toLowerCase().includes("i'll create") || 
         content.toLowerCase().includes("i will create") ||
         content.toLowerCase().includes("creating this email") ||
         content.toLowerCase().includes("let me create")) &&
        content.toLowerCase().includes('name:') && 
        content.toLowerCase().includes('subject:');
      
      if (shouldCreate) {
        console.log('📧 Creating email in MCE...');
        
        // Extract details from Claude's response
        const nameMatch = content.match(/Name:\s*([^\n]+)/i);
        const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
        const contentMatch = content.match(/Content:\s*([\s\S]+?)(?=\n\n|\n[A-Z]|$)/i);
        
        const emailName = nameMatch ? nameMatch[1].trim() : `AI Email ${new Date().toLocaleDateString()}`;
        const emailSubject = subjectMatch ? subjectMatch[1].trim() : 'Marketing Email';
        const emailContent = contentMatch ? contentMatch[1].trim() : content;
        
        if (process.env.MCE_API_KEY) {
          mceResult = await callMCPServer('email/create', {
            name: emailName,
            subject: emailSubject,
            template: 'custom',
            content: {
              headline: emailSubject,
              message: emailContent,
              nlpCommand: `Create a marketing email with subject "${emailSubject}". ${emailContent}`
            }
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

      return Response.json({
        content: content,
        mceResult: mceResult,
        model: modelToUse,
      });
    }

    // Streaming response
    console.log('Creating streaming response with model:', modelToUse);
    
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
          
          // Check if we should create email after stream completes
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
              const mceResult = await callMCPServer('email/create', {
                name: nameMatch[1].trim(),
                subject: subjectMatch[1].trim(),
                template: 'custom',
                content: {
                  headline: subjectMatch[1].trim(),
                  message: fullResponse,
                  nlpCommand: fullResponse
                }
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
    
    // If it's a model not found error, provide helpful message
    if (error.message?.includes('not_found_error')) {
      return Response.json(
        { 
          error: 'Claude model not found',
          details: `Model ${modelToUse} is not available. Try setting CLAUDE_MODEL env var to: claude-3-5-sonnet-20241022, claude-3-opus-20240229, or claude-3-haiku-20240307`,
          availableModels: [
            'claude-3-5-sonnet-20241022 (Sonnet 4 - Latest)',
            'claude-3-opus-20240229 (Most capable)',
            'claude-3-haiku-20240307 (Fastest)',
          ]
        },
        { status: 500 }
      );
    }
    
    return Response.json(
      { 
        error: error.message || 'Internal server error',
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