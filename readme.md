# MCE Email Chat Interface

AI-powered chat interface for creating marketing emails in Salesforce Marketing Cloud Engagement using Claude AI.

## Features

- 💬 Natural language chat interface
- 📧 Create marketing emails through conversation
- 🎨 Preview emails before creation
- 📊 List and manage data extensions
- ☁️ Fully cloud-based (no local setup required)
- 🚀 One-click deploy to Vercel

## Architecture

```
Vercel Frontend → Vercel API Routes → Claude AI
                         ↓
                  MCE Server (Fly.io)
```

## Quick Deploy

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/slysly-code/mce-email-chat&env=CLAUDE_API_KEY,MCE_AUTH_TOKEN,MCE_SERVER_URL)

1. Click the button above
2. Add your environment variables:
   - `CLAUDE_API_KEY`: Get from [Anthropic Console](https://console.anthropic.com/)
   - `MCE_AUTH_TOKEN`: Your MCE server authentication token
   - `MCE_SERVER_URL`: Your MCE server URL (default: https://salesforce-mce-api.fly.dev)
3. Deploy!

## Manual Setup

### Prerequisites

- Node.js 18+ 
- GitHub account
- Vercel account (free)
- Claude API key from [Anthropic](https://console.anthropic.com/)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/slysly-code/mce-email-chat.git
cd mce-email-chat
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```env
CLAUDE_API_KEY=sk-ant-api03-xxxxx
MCE_AUTH_TOKEN=your-mce-auth-token
MCE_SERVER_URL=https://salesforce-mce-api.fly.dev
```

4. Run development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
mce-email-chat/
├── app/
│   ├── chat/
│   │   └── route.js         # API endpoint for chat
│   ├── page.js              # Main chat interface
│   ├── layout.js            # App layout
│   └── globals.css          # Global styles
├── package.json
├── tailwind.config.js
├── vercel.json              # Vercel configuration
├── postcss.config.js
└── .env.local               # Environment variables (not in git)
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CLAUDE_API_KEY` | Anthropic API key for Claude | Yes |
| `MCE_AUTH_TOKEN` | Authentication token for MCE server | Yes |
| `MCE_SERVER_URL` | URL of your MCE server | Yes |

### Vercel Configuration

The project includes a `vercel.json` file that sets:
- Maximum function duration: 30 seconds for the chat API route
- This allows enough time for Claude API responses and MCE operations

No additional Vercel configuration is needed.

### Customizing MCE Integration

Edit `app/chat/route.js` to customize your MCE server integration:

```javascript
// The route uses a helper function to call your MCE server
async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_AUTH_TOKEN = process.env.MCE_AUTH_TOKEN;

  const response = await fetch(`${MCE_SERVER_URL}/api/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MCE_AUTH_TOKEN}`,
    },
    body: JSON.stringify(params),
  });
  
  return await response.json();
}
```

## Usage

1. **Start a conversation**: Type your request in natural language
2. **Quick actions**: Use preset buttons for common tasks
3. **Preview emails**: The assistant will show a preview before creating
4. **Confirm creation**: Approve the email to send it to MCE

### Example Prompts

- "Create a welcome email for new subscribers"
- "Build a Black Friday promotional email with 25% off"
- "Make a monthly newsletter template"
- "List all available data extensions"
- "Create a re-engagement campaign email"

## API Features

The chat interface supports:
- **Streaming responses**: Real-time Claude AI responses
- **Non-streaming mode**: Simple request-response pattern
- **MCE integration**: Automatic detection of email creation requests
- **CORS support**: Proper cross-origin request handling

## Deployment Options

### Vercel (Recommended)
- Free tier available (10-second timeout)
- Pro tier recommended for production (60-second timeout)
- Automatic deployments from GitHub
- Serverless functions for API

### Alternative Platforms
- **Railway**: Full-stack platform with easy deployment
- **Render**: Simple cloud platform
- **Fly.io**: Same platform as your MCE server
- **Netlify**: With function support

## Related Projects

- [MCE MCP Server](https://github.com/slysly-code/salesforce-mce-mcp-server-api) - The MCE server this connects to

## Troubleshooting

### Connection Issues
- Verify `MCE_SERVER_URL` is correct and accessible
- Check `MCE_AUTH_TOKEN` is valid
- Ensure MCE server is running on Fly.io

### API Errors
- Verify `CLAUDE_API_KEY` is correct
- Check Anthropic API rate limits
- Review browser console for detailed error messages
- Check Vercel function logs for server-side errors

### Timeout Issues
- Free Vercel tier has 10-second timeout limit
- Consider upgrading to Pro for 60-second timeout
- Or optimize API calls to be faster

### Path Issues
- Frontend calls should use `/chat` endpoint
- The API route is at `app/chat/route.js`
- Update frontend if it's calling `/api/chat`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the [MCE Server documentation](https://github.com/slysly-code/salesforce-mce-mcp-server-api)

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Claude AI](https://anthropic.com)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Deployed on [Vercel](https://vercel.com)