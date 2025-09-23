// app/page.js - With NextAuth
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function ChatPage() {
  const { data: session, status } = useSession();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Test connection on mount (only if authenticated)
  useEffect(() => {
    if (status === 'authenticated') {
      testConnection();
    }
  }, [status]);

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
          stream: false,
        }),
      });
      
      if (response.ok) {
        setConnectionStatus('connected');
        setError(null);
      } else {
        setConnectionStatus('error');
        setError('API connection failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setError(`Connection test failed: ${error.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const useStreaming = false;

      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: useStreaming,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      if (!useStreaming) {
        const data = await response.json();
        setMessages([...newMessages, {
          role: 'assistant',
          content: data.content,
          mceResult: data.mceResult,
        }]);
      } else {
        // Streaming response handling (same as before)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = { role: 'assistant', content: '', mceResult: null };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                setMessages([...newMessages, assistantMessage]);
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.text) {
                  assistantMessage.content += parsed.text;
                  setMessages([...newMessages, { ...assistantMessage }]);
                }
                
                if (parsed.mceResult) {
                  assistantMessage.mceResult = parsed.mceResult;
                  setMessages([...newMessages, { ...assistantMessage }]);
                }
              } catch (e) {
                console.error('Parse error:', e, 'Raw data:', data);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setError(`Error: ${error.message}`);
      setMessages([...newMessages, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}`,
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    'Create a welcome email',
    'Build a promotional email',
    'List data extensions',
    'Create a journey',
  ];

  const handleQuickAction = (action) => {
    setInput(action);
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto p-4 justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">MCE Email Chat</h1>
          <p className="text-gray-600 mb-8 text-center">
            Sign in to access the Marketing Cloud Email Chat Interface
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => signIn('google')}
              className="w-full px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
            
            <button
              onClick={() => signIn('github')}
              className="w-full px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              Sign in with GitHub
            </button>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>
            
            <button
              onClick={() => signIn('credentials')}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Sign in with Email
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-6 text-center">
            Access restricted to authorized users only
          </p>
        </div>
      </div>
    );
  }

  // Authenticated - show chat interface
  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg flex-1 flex flex-col">
        {/* Header with user info and logout */}
        <div className="border-b p-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">MCE Email Chat</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-medium ${
                connectionStatus === 'connected' ? 'text-green-600' : 
                connectionStatus === 'error' ? 'text-red-600' : 
                'text-yellow-600'
              }`}>
                {connectionStatus}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{session.user?.name || session.user?.email}</p>
              <p className="text-xs text-gray-500">{session.user?.email}</p>
            </div>
            {session.user?.image && (
              <img
                src={session.user.image}
                alt="Profile"
                className="w-8 h-8 rounded-full"
              />
            )}
            <button
              onClick={() => signOut()}
              className="px-4 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p>Welcome {session.user?.name || session.user?.email}!</p>
              <p className="mt-2">Start a conversation to create Marketing Cloud emails and journeys!</p>
              <div className="mt-4">
                <p className="text-sm mb-2">Try one of these:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickAction(action)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : message.isError
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                
                {message.mceResult && (
                  <div className="mt-2 p-2 bg-green-100 rounded text-green-800 text-sm">
                    <p className="font-semibold">MCE Action Completed:</p>
                    <pre>{JSON.stringify(message.mceResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to create an email or journey..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
            <button
              type="button"
              onClick={testConnection}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              title="Test Connection"
            >
              🔌
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}