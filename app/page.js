'use client';

import { useState } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your MCE Email Assistant. I can help you create marketing emails in Salesforce Marketing Cloud. Just tell me what kind of email you'd like to create!",
      id: 1
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input,
      id: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          conversationHistory: conversationHistory
        })
      });

      const data = await response.json();

      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        id: Date.now() + 1,
        toolCalled: data.toolCalled,
        toolResult: data.toolResult
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: input },
        { role: 'assistant', content: data.response }
      ].slice(-20)); // Keep last 20 messages

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        id: Date.now() + 1,
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    'Create a welcome email for new subscribers',
    'Build a promotional email for Black Friday',
    'Create a newsletter template',
    'List available data extensions'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-4xl h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">MCE Email Builder</h1>
          <p className="text-sm text-gray-600">Create marketing emails with AI assistance</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="animate-fadeIn">
              <div className={`flex items-start space-x-2 ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${
                  message.role === 'user' ? 'bg-gray-600' : 'bg-blue-500'
                }`}>
                  {message.role === 'user' ? 'You' : 'AI'}
                </div>
                <div className={`flex-1 ${message.error ? 'bg-red-50 border border-red-200' : 'bg-white'} rounded-lg shadow-sm p-4 ${
                  message.role === 'user' ? 'ml-12' : 'mr-12'
                }`}>
                  <p className="text-gray-800 whitespace-pre-wrap">{message.content}</p>
                  
                  {message.toolCalled === 'preview_email' && message.toolResult?.preview && (
                    <div className="bg-gray-50 rounded p-3 mt-3">
                      <p className="font-semibold text-sm text-gray-600 mb-2">📧 Email Preview:</p>
                      <p className="text-sm"><strong>Subject:</strong> {message.toolResult.preview.subject}</p>
                      <p className="text-sm"><strong>From:</strong> {message.toolResult.preview.fromName} &lt;{message.toolResult.preview.fromEmail}&gt;</p>
                      <div className="mt-2 p-2 bg-white rounded border">
                        <div className="text-sm" dangerouslySetInnerHTML={{ __html: message.toolResult.preview.content }} />
                      </div>
                    </div>
                  )}
                  
                  {message.toolCalled && message.toolCalled !== 'preview_email' && (
                    <div className="bg-green-50 rounded p-2 mt-2">
                      <p className="text-sm text-green-800">✅ Executed: {message.toolCalled}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex items-start space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
                AI
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-white border-t p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the email you want to create..."
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
          
          <div className="mt-2 flex flex-wrap gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => setInput(action)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}