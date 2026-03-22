import { Heart, MessageCircle, User, ArrowLeft } from 'lucide-react';
import { matches, users } from '../data/mockData';

interface MatchListScreenProps {
  onNavigate: (screen: string, userId?: string) => void;
}

export function MatchListScreen({ onNavigate }: MatchListScreenProps) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-gray-200">
        <button onClick={() => onNavigate('home')}>
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl">Matches</h1>
      </div>

      {/* Match List */}
      <div className="flex-1 overflow-y-auto">
        {matches.map((match) => {
          const user = users.find((u) => u.id === match.userId);
          if (!user) return null;

          return (
            <button
              key={match.id}
              onClick={() => onNavigate('chat', user.id)}
              className="w-full flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              {/* Avatar */}
              <div className="relative">
                <img
                  src={user.images[0]}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
                {match.unread && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">
                    1
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className={match.unread ? '' : 'text-gray-600'}>
                    {user.name}
                  </span>
                  <span className="text-sm text-gray-400">{match.lastMessageTime}</span>
                </div>
                <p
                  className={`text-sm line-clamp-1 ${
                    match.unread ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {match.lastMessage}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-around py-3 bg-white border-t border-gray-200">
        <button
          onClick={() => onNavigate('home')}
          className="flex flex-col items-center gap-1"
        >
          <Heart className="w-6 h-6 text-gray-400" />
          <span className="text-xs text-gray-400">Discover</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <MessageCircle className="w-6 h-6 text-rose-500 fill-rose-500" />
          <span className="text-xs text-rose-500">Matches</span>
        </button>
        <button
          onClick={() => onNavigate('myProfile')}
          className="flex flex-col items-center gap-1"
        >
          <User className="w-6 h-6 text-gray-400" />
          <span className="text-xs text-gray-400">Profile</span>
        </button>
      </div>
    </div>
  );
}
