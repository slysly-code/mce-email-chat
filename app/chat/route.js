import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';

// Validate required environment variables
if (!process.env.CLAUDE_API_KEY) {
  console.error('Missing CLAUDE_API_KEY environment variable');
}
if (!process.env.MCE_API_KEY) {
  console.error('Missing MCE_API_KEY environment variable');
}

// Define tools for Claude
const tools = [
  {
    name: "create_marketing_email",
    description: "Create a marketing email in Salesforce Marketing Cloud Engagement",
    input_schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Email subject line"
        },
        content: {
          type: "string", 
          description: "HTML or text content of the email"
        },
        fromName: {
          type: "string",
          description: "Sender name"
        },
        fromEmail: {
          type: "string",
          description: "Sender email address"
        },
        audience: {
          type: "string",
          description: "Target audience or data extension"
        }
      },
      required: ["subject", "content"]
    }
  },
  {
    name: "get_data_extensions",
    description: "List available data extensions in Salesforce MCE",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "preview_email",
    description: "Generate a preview of the email before sending",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        content: { type: "string" },
        fromName: { type: "string" },
        fromEmail: { type: "string" }
      },
      required: ["subject", "content"]
    }
  }
];

// Function to call MCE server
async function callMCEServer(tool, params) {
  try {
    // Your MCE server uses X-API-Key header for authentication
    const headers = {
      'X-API-Key': process.env.MCE_API_KEY,
      'Content-Type': 'application/json'
    };

    switch(tool) {
      case 'create_marketing_email':
        const response = await axios.post(`${MCE_SERVER_URL}/api/email/create`, {
          subject: params.subject,
          content: params.content,
          fromName: params.fromName || 'Marketing Team',
          fromEmail: params.fromEmail || 'marketing@company.com',
          audience: params.audience || 'All Subscribers'
        }, { headers });
        return response.data;

      case 'get_data_extensions':
        const dataExtResponse = await axios.get(`${MCE_SERVER_URL}/api/data-extensions`, { headers });
        return dataExtResponse.data;

      case 'preview_email':
        return {
          preview: {
            subject: params.subject,
            content: params.content,
            fromName: params.fromName || 'Marketing Team',
            fromEmail: params.fromEmail || 'marketing@company.com',
            status: 'preview'
          }
        };

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    console.error(`Error calling MCE server:`, error.message);
    throw error;
  }
}

export async function POST(request) {
  try {
    const { message, conversationHistory = [] } = await request.json();

    // Build message history
    const messages = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Call Claude with tools
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      tools: tools,
      messages: messages,
      system: `You are a helpful assistant that helps create marketing emails in Salesforce Marketing Cloud Engagement. 
               When users ask to create an email, gather the necessary information (subject, content, audience) and use the tools provided.
               Always preview the email first before creating it in the system.
               Be creative and helpful with email content suggestions.`
    });

    // Check if Claude wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(c => c.type === 'tool_use');
      
      if (toolUse) {
        try {
          // Execute the tool
          const toolResult = await callMCEServer(toolUse.name, toolUse.input);
          
          // Get final response from Claude
          const followUpResponse = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            tools: tools,
            messages: [
              ...messages,
              { role: 'assistant', content: response.content },
              { 
                role: 'user', 
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(toolResult)
                  }
                ]
              }
            ]
          });

          return Response.json({
            response: followUpResponse.content[0].text,
            toolCalled: toolUse.name,
            toolResult: toolResult
          });
        } catch (toolError) {
          return Response.json({
            response: `I encountered an error while executing the ${toolUse.name} tool: ${toolError.message}. Let me help you another way.`,
            error: true
          });
        }
      }
    }

    // Regular response without tool use
    return Response.json({
      response: response.content[0].text
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'An error occurred processing your request',
      details: error.message 
    }, { status: 500 });
  }
}