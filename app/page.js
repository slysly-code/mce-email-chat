// app/page.js
// Main chat interface for MCE Email creation

'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I can help you create marketing emails and journeys in Salesforce Marketing Cloud. What would you like to create today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const quickActions = [
    { label: '📧 Create Welcome Email', prompt: 'Create a welcome email for new subscribers with personalization' },
    { label: '🛒 Abandoned Cart', prompt: 'Build an abandoned cart recovery email with a 15% discount' },
    { label: '📰 Newsletter', prompt: 'Create a monthly newsletter template with multiple content sections' },
    { label: '🎯 Re-engagement', prompt: 'Design a re-engagement email for inactive subscribers' },
    { label: '📊 List Emails', prompt: 'Show me the list of existing emails' },
    { label: '🗂️ Data Extensions', prompt: 'List available data extensions' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}`,
          isError: true
        }]);
      } else {
        // Handle tool results
        if (data.toolResult) {
          handleToolResult(data.toolResult, data.message);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.message
          }]);
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${error.message}`,
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolResult = (toolResult, message) => {
    if (toolResult.action === 'preview') {
      setEmailPreview(toolResult.data);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: message || 'Here\'s a preview of your email. Click "Create in MCE" to proceed.',
        preview: toolResult.data
      }]);
    } else if (toolResult.success) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: message || `✅ Successfully completed: ${toolResult.action}`,
        data: toolResult.data
      }]);
    } else {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Failed: ${toolResult.error}`,
        isError: true
      }]);
    }
  };

  const createEmailInMCE = async () => {
    if (!emailPreview) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_editable_email',
          parameters: emailPreview
        })
      });

      const data = await response.json();
      handleToolResult(data.toolResult || data, 'Email created successfully in MCE!');
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to create email: ${error.message}`,
        isError: true
      }]);
    } finally {
      setIsLoading(false);
      setEmailPreview(null);
    }
  };

  const handleQuickAction = (prompt) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MCE Email Creator</h1>
            <p className="text-sm text-gray-500">Powered by Claude AI & MCP Server</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Connected to MCE</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickAction(action.prompt)}
              className="flex-shrink-0 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.isError
                    ? 'bg-red-50 text-red-900 border border-red-200'
                    : 'bg-white shadow-sm border border-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {/* Email Preview */}
                {message.preview && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold mb-2">Email Preview:</h3>
                    <div className="bg-white p-2 rounded border border-gray-200">
                      <p className="text-sm text-gray-600 mb-1">Subject: {message.preview.subject}</p>
                      {message.preview.preheader && (
                        <p className="text-sm text-gray-500 mb-2">Preheader: {message.preview.preheader}</p>
                      )}
                      <div className="border-t pt-2">
                        <div dangerouslySetInnerHTML={{ __html: message.preview.html }} />
                      </div>
                    </div>
                    <button
                      onClick={createEmailInMCE}
                      className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Create in MCE
                    </button>
                  </div>
                )}

                {/* Data Display */}
                {message.data && (
                  <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                    <pre className="overflow-x-auto">
                      {JSON.stringify(message.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white shadow-sm border border-gray-200 px-4 py-3 rounded-lg">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to create an email or journey..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Processing...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}