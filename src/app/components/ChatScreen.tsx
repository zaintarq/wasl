import { useState } from 'react';
import { ArrowLeft, Send, Smile, Image as ImageIcon, EllipsisVertical } from 'lucide-react';
import { users, getMessagesByUserId } from '../data/mockData';

interface ChatScreenProps {
  onNavigate: (screen: string, userId?: string) => void;
  userId: string | null;
}

export function ChatScreen({ onNavigate, userId }: ChatScreenProps) {
  const [message, setMessage] = useState('');
  const user = users.find((u) => u.id === userId);
  const messages = userId ? getMessagesByUserId(userId) : [];

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">User not found</p>
      </div>
    );
  }

  const handleSend = () => {
    if (message.trim()) {
      // In a real app, send the message
      setMessage('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <button onClick={() => onNavigate('matches')}>
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <button
          onClick={() => onNavigate('profile', user.id)}
          className="flex items-center gap-3 flex-1"
        >
          <img
            src={user.images[0]}
            alt={user.name}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="text-left">
            <div>{user.name}</div>
            <div className="text-xs text-gray-500">Active now</div>
          </div>
        </button>
        <button>
          <EllipsisVertical className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.senderId === 'me' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                msg.senderId === 'me'
                  ? 'bg-rose-500 text-white rounded-br-sm'
                  : 'bg-white text-gray-900 rounded-bl-sm'
              }`}
            >
              <p>{msg.text}</p>
              <p
                className={`text-xs mt-1 ${
                  msg.senderId === 'me' ? 'text-rose-100' : 'text-gray-500'
                }`}
              >
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-center gap-2">
          <button className="p-2">
            <Smile className="w-6 h-6 text-gray-400" />
          </button>
          <button className="p-2">
            <ImageIcon className="w-6 h-6 text-gray-400" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full outline-none focus:border-rose-500"
          />
          <button
            onClick={handleSend}
            className="p-2 bg-rose-500 rounded-full disabled:opacity-50"
            disabled={!message.trim()}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}