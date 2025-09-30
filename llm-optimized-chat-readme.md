# MCE Email Chat Interface

AI-powered chat interface that enables natural language email creation in Salesforce Marketing Cloud Engagement through Claude AI integration.

## System Architecture

```
NextJS App (Vercel) → Claude AI API → MCE MCP Server (Fly.io) → Marketing Cloud
     ↓                                          ↓
  NextAuth                               Token Management
```

## Core Capabilities

### Email Creation Flow
1. User provides natural language request (e.g., "Create a welcome email for new subscribers")
2. Claude AI processes request and generates structured response with Name, Subject, and Content fields
3. System detects creation intent when response contains "I'll create" or "I will create" with proper field structure
4. Calls MCE MCP Server endpoint `/api/tool/build_email` with `nlpCommand` parameter
5. MCP Server creates fully editable email in Marketing Cloud Content Builder
6. Returns email ID and confirmation to user

### Authentication & Security
- NextAuth.js with JWT session strategy
- Supports credentials-based authentication (username/password)
- Middleware protection on all routes except `/api/auth/*`
- Environment-based access control via `ALLOWED_EMAILS` or `ALLOWED_DOMAINS`

## Critical Implementation Details

### API Endpoints

#### Chat Endpoint: `/chat` (POST)
```javascript
// Request structure
{
  messages: [
    { role: "user", content: "Create a welcome email" }
  ],
  stream: false  // Set to true for SSE streaming
}

// Response structure
{
  content: "Claude's response text",
  mceResult: {
    success: true,
    emailId: 1644306,
    name: "Email name",
    message: "Success message"
  },
  model: "claude-3-sonnet-20240229"
}
```

#### MCE Integration Pattern
```javascript
// The chat route calls MCE server using this pattern:
await callMCPServer('tool/build_email', {
  name: emailName,           // Extracted from Claude response
  subject: emailSubject,     // Extracted from Claude response
  nlpCommand: emailContent,  // Full content for AI processing
  template: 'custom'
});
```

### Environment Variables

| Variable | Purpose | Required | Example/Format |
|----------|---------|----------|----------------|
| `CLAUDE_API_KEY` | Anthropic API authentication | Yes | `sk-ant-api03-*` |
| `CLAUDE_MODEL` | Specific Claude model to use | No | `claude-3-sonnet-20240229` |
| `MCE_API_KEY` | MCP Server authentication | Yes | Generated during Fly.io deployment |
| `MCE_SERVER_URL` | MCP Server endpoint | Yes | `https://salesforce-mce-api.fly.dev` |
| `NEXTAUTH_SECRET` | Session encryption | Yes | 32+ character random string |
| `NEXTAUTH_URL` | Callback URL for auth | Yes | Production URL |
| `ADMIN_EMAIL` | Login credential | Yes | Valid email |
| `ADMIN_PASSWORD` | Login credential | Yes | Strong password |
| `ALLOWED_EMAILS` | Restrict access (comma-separated) | No | `user1@co.com,user2@co.com` |
| `ALLOWED_DOMAINS` | Restrict by domain | No | `company.com` |

## System Limitations & Constraints

### Technical Limitations
- **Vercel Timeout**: 10 seconds (Hobby), 60 seconds (Pro) - affects complex email generation
- **Claude API Rate Limits**: Based on Anthropic tier, typically 50-1000 requests/minute
- **Streaming Response**: SSE implementation may disconnect on long responses
- **Model Availability**: Must handle model deprecation gracefully (fallback logic implemented)

### MCE Integration Constraints
- Emails created via `nlpCommand` are interpreted by MCP Server's parsing logic
- No direct HTML editing - system generates HTML from structured content
- Template types limited to: 'custom', 'welcome', 'newsletter', 'promotional'
- No journey builder integration (planned feature)
- Single Business Unit support per API key

### Authentication Limitations
- No SSO/SAML support (credentials only in base implementation)
- Session timeout: 30 days (configurable)
- No role-based access control (all authenticated users have full access)

## Error Handling Patterns

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| 500 on `/chat` | Claude model not found | Set `CLAUDE_MODEL` env var to valid model |
| 404 on MCE call | Wrong endpoint called | Ensure using `/api/tool/build_email` |
| 401 on MCE | Invalid API key | Check `MCE_API_KEY` matches Fly.io deployment |
| NextAuth redirect loop | Middleware misconfiguration | Ensure auth routes excluded from protection |

### Debug Points
- Vercel Functions logs: Check for "MCE API CALL" and response status
- Claude response must include "Name:" and "Subject:" for email creation
- MCE Server expects `nlpCommand` field for AI processing
- Check `mceResult` object in chat response for creation status

## Data Flow for Email Creation

```javascript
// 1. User Input
"Create a welcome email for new subscribers"

// 2. Claude Processes with System Prompt
systemPrompt = "When user asks to create email, respond with Name:, Subject:, Content:"

// 3. Claude Response Format (Required)
"I'll create this email for you:
Name: Welcome Email for New Subscribers
Subject: Welcome to Our Community!
Content: [detailed description]"

// 4. Extraction Pattern
nameMatch = /Name:\s*([^\n]+)/i
subjectMatch = /Subject:\s*([^\n]+)/i

// 5. MCE Server Call
POST /api/tool/build_email
{
  name: "Welcome Email for New Subscribers",
  subject: "Welcome to Our Community!",
  nlpCommand: "[full Claude response for context]",
  template: "custom"
}
```

## Testing & Validation

### Smoke Test Sequence
1. Health check: `GET /api/auth/session` (should return session or null)
2. Authentication: Login via `/api/auth/signin`
3. Chat test: Send "test" message, verify Claude response
4. Email creation: Send "Create a test email", verify `mceResult.success`

### Integration Points to Verify
- Claude API: Check model availability before deployment
- MCE Server: `curl -H "X-API-Key: KEY" https://MCE_SERVER_URL/health`
- Marketing Cloud: Verify emails appear in Content Builder

## State Management

- **Authentication State**: Managed by NextAuth, stored in JWT
- **Chat History**: Maintained in React state (not persisted)
- **MCE Results**: Displayed inline, not stored
- **No Database**: System is stateless except for session tokens

## Performance Optimization Opportunities

1. **Cache Claude Responses**: For similar requests (not implemented)
2. **Batch MCE Operations**: Queue multiple emails (not implemented)
3. **Implement Redis**: For session storage at scale
4. **Add CDN**: For static assets on Vercel

## Related Systems

- **MCE MCP Server**: Handles actual Marketing Cloud API calls, token refresh, and email creation
- **Marketing Cloud**: Final destination for emails, requires API credentials configuration
- **Claude Desktop**: Can use same MCP server via stdio transport for local testing