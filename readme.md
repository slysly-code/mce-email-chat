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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/mce-email-chat&env=CLAUDE_API_KEY,MCE_AUTH_TOKEN,MCE_SERVER_URL)

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
git clone https://github.com/YOUR_USERNAME/mce-email-chat.git
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
│   ├── api/
│   │   └── chat/
│   │       └── route.js      # API endpoint for chat
│   ├── page.js              # Main chat interface
│   ├── layout.js            # App layout
│   └── globals.css          # Global styles
├── package.json
├── tailwind.config.js
├── vercel.json
└── .env.local              # Environment variables (not in git)
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CLAUDE_API_KEY` | Anthropic API key for Claude | Yes |
| `MCE_AUTH_TOKEN` | Authentication token for MCE server | Yes |
| `MCE_SERVER_URL` | URL of your MCE server | Yes |

### Customizing MCE Endpoints

Edit `app/api/chat/route.js` to match your MCE server endpoints:

```javascript
// Update these endpoints to match your server
case 'create_marketing_email':
  const response = await axios.post(`${MCE_SERVER_URL}/api/email/create`, {...});
  
case 'get_data_extensions':
  const response = await axios.get(`${MCE_SERVER_URL}/api/data-extensions`, {...});
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

## Tools Available

The chat interface can:
- **create_marketing_email**: Create emails in MCE
- **preview_email**: Preview before sending
- **get_data_extensions**: List available audiences

## Deployment Options

### Vercel (Recommended)
- Free tier available
- Automatic deployments from GitHub
- Serverless functions for API

### Alternative Platforms
- **Railway**: Full-stack platform with easy deployment
- **Render**: Simple cloud platform
- **Fly.io**: Same platform as your MCE server

## Related Projects

- [MCE MCP Server](https://github.com/slysly-code/salesforce-mce-mcp-server-api) - The MCE server this connects to

## Troubleshooting

### Connection Issues
- Verify MCE_SERVER_URL is correct
- Check MCE_AUTH_TOKEN is valid
- Ensure MCE server is running

### API Errors
- Verify CLAUDE_API_KEY is correct
- Check API rate limits
- Review browser console for errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing issues for solutions

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Claude AI](https://anthropic.com)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
