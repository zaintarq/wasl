import { ArrowLeft, Github, Heart, Users, Code, Star } from 'lucide-react';

interface CommunityScreenProps {
  onNavigate: (screen: string) => void;
}

export function CommunityScreen({ onNavigate }: CommunityScreenProps) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-gray-200">
        <button onClick={() => onNavigate('settings')}>
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl">Open Source Community</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-rose-500 to-pink-600 text-white p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Heart className="w-8 h-8 fill-white" />
            </div>
          </div>
          <h2 className="text-2xl mb-2">Built by the Community</h2>
          <p className="text-white/90 max-w-md mx-auto">
            Huzz is 100% free and open-source. Join us in creating a social app
            where people connect freely.
            that's transparent, inclusive, and community-driven.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-200">
          <div className="text-center">
            <div className="text-2xl mb-1">2.5k</div>
            <div className="text-sm text-gray-600">Stars</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">143</div>
            <div className="text-sm text-gray-600">Contributors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">89</div>
            <div className="text-sm text-gray-600">Forks</div>
          </div>
        </div>

        {/* GitHub Link */}
        <div className="p-6">
          <a
            href="https://github.com/huzz-dating/huzz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Github className="w-6 h-6" />
              <div>
                <div>View on GitHub</div>
                <div className="text-sm text-gray-400">github.com/huzz-dating/huzz</div>
              </div>
            </div>
            <Star className="w-5 h-5" />
          </a>
        </div>

        {/* Contribute Section */}
        <div className="px-6 pb-6">
          <h3 className="mb-4">How to Contribute</h3>
          
          <div className="space-y-3">
            <div className="flex gap-3 p-4 bg-gray-50 rounded-xl">
              <Code className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="mb-1">Write Code</div>
                <p className="text-sm text-gray-600">
                  Help us build features, fix bugs, and improve the codebase.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-gray-50 rounded-xl">
              <Users className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="mb-1">Design & UX</div>
                <p className="text-sm text-gray-600">
                  Help improve the user experience and visual design.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-gray-50 rounded-xl">
              <Star className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="mb-1">Share Feedback</div>
                <p className="text-sm text-gray-600">
                  Report bugs, suggest features, and help us improve.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Guidelines */}
        <div className="px-6 pb-6">
          <h3 className="mb-4">Community Guidelines</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <p>🤝 Be respectful and inclusive</p>
            <p>💬 Communicate openly and constructively</p>
            <p>🔒 Respect user privacy and data security</p>
            <p>❤️ Help create a safe space to connect freely</p>
            <p>📖 Follow our Code of Conduct</p>
          </div>
        </div>

        {/* License */}
        <div className="px-6 pb-8 text-center text-sm text-gray-500">
          <p>Licensed under MIT License</p>
          <p className="mt-2">Free to use, modify, and distribute</p>
        </div>
      </div>
    </div>
  );
}
