# Troubleshooting Guide

## System Diagnostic Checklist

### Quick Health Check Sequence
```bash
# 1. Check MCP Server
curl -H "X-API-Key: YOUR_KEY" https://salesforce-mce-api.fly.dev/health

# 2. Check Chat App
curl https://mce-email-chat.vercel.app/api/auth/session

# 3. Test Claude API
# Check Anthropic Console for API status

# 4. Verify Marketing Cloud
# Check Content Builder for created emails
```

## Common Integration Issues

### Email Not Created in MCE Despite Success Message

**Symptoms**: Chat says "email created" but nothing in Marketing Cloud

**Root Causes & Solutions**:

1. **Wrong endpoint called**
   - Verify: Check Vercel logs for actual URL called
   - Fix: Must be `/api/tool/build_email` not `/api/email/create`

2. **Missing nlpCommand field**
   - Verify: Check request payload in logs
   - Fix: Ensure `nlpCommand` field is populated with content

3. **MCE token expired**
   - Verify: Check MCP server logs for 401 errors
   - Fix: Restart MCP server to force token refresh

4. **Business Unit mismatch**
   - Verify: Check MCE_DEFAULT_MID matches your BU
   - Fix: Set correct Business Unit ID in environment

### Claude Model Errors

**Error**: `404 model: claude-x-xxx not found`

**Solution Matrix**:

| Model String | Status | Alternative |
|--------------|--------|-------------|
| `claude-3-5-sonnet-20241022` | May not exist | Use env var |
| `claude-3-sonnet-20240229` | Stable | Recommended |
| `claude-3-haiku-20240307` | Stable, cheap | For cost saving |
| `claude-2.1` | Legacy | Fallback option |

**Fix**: Set `CLAUDE_MODEL` env var in Vercel to working model

### Authentication Issues

**NextAuth Redirect Loop**

Symptoms: Infinite redirects, ERR_TOO_MANY_REDIRECTS

Fix sequence:
1. Check middleware.js excludes `/api/auth/*`
2. Clear browser cookies
3. Verify NEXTAUTH_URL matches deployment URL
4. Ensure NEXTAUTH_SECRET is set

**Login Fails with Correct Credentials**

Check points:
- Environment variables in Vercel (no quotes, no spaces)
- ADMIN_EMAIL exactly matches login attempt
- Password case-sensitive match
- No trailing spaces in env values

### Vercel Deployment Failures

**Build Error: Top-level await**

Location: Any `await` outside async function
Fix: Ensure all `await` statements are inside async functions

**Build Error: Module not found**

Common missing modules:
- `next-auth` - Run `npm install next-auth`
- `@anthropic-ai/sdk` - Check package.json

**Environment Variables Not Applied**

Fix sequence:
1. Change env var in Vercel dashboard
2. Trigger redeploy (not automatic)
3. Or push empty commit: `git commit --allow-empty -m "Redeploy"`

### MCP Server Connection Issues

**Cannot Connect to MCE Server**

Diagnostic steps:
```bash
# Check Fly.io status
fly status -a salesforce-mce-api

# Check logs
fly logs -a salesforce-mce-api

# Restart if needed
fly restart -a salesforce-mce-api
```

**API Key Mismatch**

Verify same key in:
- Fly.io secrets: `fly secrets list`
- Vercel env: `MCE_API_KEY`
- Headers sent: `X-API-Key` (not Authorization Bearer)

## Performance Issues

### Slow Email Creation

**Timeout on Vercel Hobby Plan**
- Symptom: 504 timeout after 10 seconds
- Solution: Upgrade to Pro (60 second timeout)

**MCE API Slow Response**
- Check Marketing Cloud system status
- Verify not hitting rate limits (2,500/min)
- Consider implementing queue system

### Chat Not Responding

**Claude API Issues**
```javascript
// Check these failure points:
1. API key validity - Anthropic Console
2. Rate limits - Check usage dashboard
3. Model availability - Try different model
4. Network issues - Check Vercel function logs
```

## Debug Information Locations

### Vercel Logs
Path: Dashboard → Functions → /chat
Look for:
- "=== CHAT ROUTE CALLED ==="
- "=== MCE API CALL ==="
- "MCE Response Status:"
- Error stack traces

### MCP Server Logs
```bash
fly logs -a salesforce-mce-api --instance
```
Look for:
- Token acquisition logs
- Request processing
- MCE API responses

### Marketing Cloud Audit
- Setup → System → Data Management → Audit Events
- Check for API creation events
- Verify asset creation success

## Emergency Fixes

### Complete System Reset

```bash
# 1. Reset MCP Server
fly restart -a salesforce-mce-api

# 2. Clear Vercel cache
vercel --prod --force

# 3. Generate new tokens
# - New NEXTAUTH_SECRET
# - Rotate MCE API credentials if compromised

# 4. Clear browser state
# - Clear cookies
# - Clear localStorage
# - Hard refresh
```

### Rollback Procedure

```bash
# Find last working deployment
vercel list

# Promote previous deployment
vercel promote [deployment-url]

# Or via GitHub
git revert HEAD
git push
```

## Contact Points for Issues

1. **Claude API**: Anthropic support / Console
2. **Vercel**: Dashboard support / Status page
3. **Marketing Cloud**: Salesforce support / Trust status
4. **MCP Server**: GitHub issues on repository
5. **Integration**: Review this guide first

## Prevention Checklist

- [ ] Monitor Vercel function execution time
- [ ] Set up alerts for MCE token expiry
- [ ] Track Claude API usage vs limits
- [ ] Regular backup of environment configuration
- [ ] Document any custom modifications
- [ ] Test after Marketing Cloud updates
- [ ] Verify after model deprecation notices