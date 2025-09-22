// app/api/chat/route.js
// Vercel API Route that connects to both Claude AI and MCE MCP Server

import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
const MCE_API_KEY = process.env.MCE_AUTH_TOKEN;

// System prompt that teaches Claude about MCE capabilities
const SYSTEM_PROMPT = `You are an AI assistant specialized in creating marketing emails for Salesforce Marketing Cloud Engagement (MCE). 

You have access to these tools via the MCE MCP Server:

1. **create_editable_email** - Creates fully editable emails in MCE Content Builder
   - CRITICAL: Must use assetType.id = 207 (templatebasedemail) for editable emails
   - Structure: Slots containing blocks (text, image, button)
   - Each block needs content AND design versions

2. **create_journey** - Creates customer journeys with activities
   - Activities: EMAILV2, WAIT, ENGAGEMENTDECISION, MULTICRITERIADECISION
   - Entry modes: OnceAndDone, SingleEntryAcrossAllVersions

3. **list_emails** - Lists existing emails
4. **get_data_extensions** - Lists available data extensions
5. **create_content_block** - Creates reusable content blocks

When users ask to create emails, always:
1. Clarify requirements (industry, tone, purpose)
2. Show a preview of what will be created
3. Create as editable email (not HTML paste)
4. Confirm successful creation with email ID

Available personalization: %%firstname%%, %%lastname%%, %%email%%`;

export async function POST(request) {
  try {
    const { messages, action, parameters } = await request.json();

    // If there's a specific action, execute it
    if (action) {
      return await handleMCEAction(action, parameters);
    }

    // Otherwise, chat with Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: messages,
      tools: [
        {
          name: 'create_editable_email',
          description: 'Create a fully editable email in MCE Content Builder',
          input_schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Email name' },
              subject: { type: 'string', description: 'Email subject line' },
              preheader: { type: 'string', description: 'Email preheader text' },
              industry: { type: 'string', enum: ['retail', 'b2b', 'nonprofit', 'healthcare', 'general'] },
              template_type: { type: 'string', enum: ['welcome', 'promotional', 'newsletter', 'abandoned_cart', 're_engagement'] },
              slots: {
                type: 'object',
                properties: {
                  header: { type: 'array', description: 'Header blocks' },
                  body: { type: 'array', description: 'Body blocks' },
                  footer: { type: 'array', description: 'Footer blocks' }
                }
              }
            },
            required: ['name', 'subject']
          }
        },
        {
          name: 'create_journey',
          description: 'Create a customer journey in MCE',
          input_schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['welcome', 'abandoned_cart', 're_engagement', 'nurture'] },
              activities: { type: 'array' }
            },
            required: ['name', 'type']
          }
        },
        {
          name: 'list_emails',
          description: 'List existing emails in MCE',
          input_schema: {
            type: 'object',
            properties: {
              page: { type: 'number', default: 1 },
              pageSize: { type: 'number', default: 10 }
            }
          }
        },
        {
          name: 'preview_email',
          description: 'Show preview of email before creating',
          input_schema: {
            type: 'object',
            properties: {
              html: { type: 'string' },
              subject: { type: 'string' }
            }
          }
        }
      ]
    });

    // Check if Claude wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(c => c.type === 'tool_use');
      if (toolUse) {
        const result = await handleMCEAction(toolUse.name, toolUse.input);
        
        // Return both Claude's message and tool result
        return Response.json({
          message: response.content.find(c => c.type === 'text')?.text || '',
          toolResult: result
        });
      }
    }

    return Response.json({ 
      message: response.content[0].text,
      usage: response.usage 
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}

async function handleMCEAction(action, parameters) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': MCE_API_KEY
    };

    let endpoint = '';
    let method = 'POST';
    let body = {};

    switch (action) {
      case 'create_editable_email':
        endpoint = '/api/email/create-editable';
        body = createEditableEmailPayload(parameters);
        break;

      case 'list_emails':
        endpoint = '/api/email/list';
        method = 'GET';
        break;

      case 'create_journey':
        endpoint = '/api/journey/create';
        body = createJourneyPayload(parameters);
        break;

      case 'get_data_extensions':
        endpoint = '/api/data-extensions';
        method = 'GET';
        break;

      case 'preview_email':
        // This is handled client-side
        return {
          action: 'preview',
          data: parameters
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const response = await fetch(`${MCE_SERVER_URL}${endpoint}`, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`MCE Server error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      action,
      data
    };

  } catch (error) {
    console.error('MCE Action error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function createEditableEmailPayload(params) {
  // Structure for fully editable email (assetType 207)
  return {
    data: {
      email: {
        options: {
          characterEncoding: "utf-8"
        }
      }
    },
    name: params.name,
    assetType: {
      id: 207, // CRITICAL: Template-based email for editability
      name: "templatebasedemail"
    },
    category: {
      id: 2073800
    },
    meta: {
      globalStyles: {
        isLocked: false,
        body: {
          "font-family": "Arial,helvetica,sans-serif",
          "font-size": "16px",
          "color": "#000000",
          "background-color": "#FFFFFF"
        }
      }
    },
    views: {
      subjectline: { content: params.subject },
      preheader: { content: params.preheader || "" },
      html: {
        content: generateHTMLTemplate(params.slots),
        slots: generateSlotStructure(params.slots),
        template: {
          id: 0,
          assetType: { id: 214, name: "defaulttemplate" },
          name: "CONTENTTEMPLATES_C",
          slots: Object.keys(params.slots || {}).reduce((acc, key) => {
            acc[key] = { locked: false };
            return acc;
          }, {})
        }
      }
    }
  };
}

function generateHTMLTemplate(slots = {}) {
  const slotKeys = Object.keys(slots);
  const slotHTML = slotKeys.map(key => 
    `<tr><td><div data-type="slot" data-key="${key}"></div></td></tr>`
  ).join('');
  
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body bgcolor="#ffffff">
  <div style="font-size:0; line-height:0;">
    <custom name="opencounter" type="tracking">
    <custom name="usermatch" type="tracking" />
  </div>
  <table width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="600" class="container">
        ${slotHTML}
      </table>
    </td></tr>
  </table>
  <custom type="footer" />
</body>
</html>`;
}

function generateSlotStructure(slots = {}) {
  const slotStructure = {};
  
  // Default slot structure if none provided
  if (Object.keys(slots).length === 0) {
    slots = {
      header: [{
        key: "header-block",
        type: "image",
        content: '<table width="100%"><tr><td align="center" style="padding:20px;"><img src="https://via.placeholder.com/600x200" alt="Header"></td></tr></table>'
      }],
      body: [{
        key: "body-text",
        type: "text",
        content: '<table width="100%"><tr><td style="padding:20px;"><h1>Welcome!</h1><p>Your content here.</p></td></tr></table>'
      }]
    };
  }
  
  Object.entries(slots).forEach(([slotKey, blocks]) => {
    slotStructure[slotKey] = {
      content: blocks.map(b => `<div data-type="block" data-key="${b.key}"></div>`).join(''),
      design: '<p style="border: #cccccc dashed 1px;">Drop blocks here</p>',
      blocks: blocks.reduce((acc, block) => {
        acc[block.key] = createBlock(block);
        return acc;
      }, {})
    };
  });
  
  return slotStructure;
}

function createBlock(block) {
  const assetTypes = {
    text: { id: 196, name: "textblock" },
    image: { id: 199, name: "imageblock" },
    button: { id: 195, name: "buttonblock" },
    html: { id: 197, name: "htmlblock" }
  };
  
  return {
    assetType: assetTypes[block.type] || assetTypes.text,
    content: block.content,
    design: block.design || '<div style="padding:20px;">Block preview</div>',
    meta: {
      wrapperStyles: {
        mobile: { visible: true },
        styling: block.styling || {}
      }
    }
  };
}

function createJourneyPayload(params) {
  // Journey creation payload
  return {
    key: `journey-${Date.now()}`,
    name: params.name,
    status: "Draft",
    entryMode: "SingleEntryAcrossAllVersions",
    definitionType: "Multistep",
    workflowApiVersion: 1,
    triggers: [{
      key: "TRIGGER-1",
      name: "Entry Trigger",
      type: "AutomationAudience",
      arguments: { startActivityKey: "{{Context.StartActivityKey}}" }
    }],
    activities: params.activities || []
  };
}