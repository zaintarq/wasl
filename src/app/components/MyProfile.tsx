import { ArrowLeft, Settings, Camera, Heart, MessageCircle, User } from 'lucide-react';
import { currentUser } from '../data/mockData';

interface MyProfileProps {
  onNavigate: (screen: string) => void;
}

export function MyProfile({ onNavigate }: MyProfileProps) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
        <button onClick={() => onNavigate('home')}>
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl">My Profile</h1>
        <button onClick={() => onNavigate('settings')}>
          <Settings className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Photo Grid */}
        <div className="p-4">
          <div className="grid grid-cols-3 gap-2">
            {currentUser.images.map((image, index) => (
              <div
                key={index}
                className="aspect-square rounded-xl overflow-hidden relative group"
              >
                <img
                  src={image}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={`empty-${i}`}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 hover:border-rose-500 transition-colors"
              >
                <Camera className="w-8 h-8 text-gray-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Profile Info */}
        <div className="px-6 py-4">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-500">Name & Age</label>
              <button className="text-sm text-rose-500">Edit</button>
            </div>
            <p className="text-lg">
              {currentUser.name}, {currentUser.age}
            </p>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-500">Location</label>
              <button className="text-sm text-rose-500">Edit</button>
            </div>
            <p className="text-lg">{currentUser.location}</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-500">About</label>
              <button className="text-sm text-rose-500">Edit</button>
            </div>
            <p className="text-gray-700">{currentUser.bio}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-gray-500">Interests</label>
              <button className="text-sm text-rose-500">Edit</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentUser.interests.map((interest) => (
                <span
                  key={interest}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Premium Card */}
        <div className="mx-6 my-6 p-6 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl text-white">
          <h3 className="text-xl mb-2">Upgrade to Huzz Plus</h3>
          <p className="text-sm text-white/90 mb-4">
            Get unlimited likes, see who likes you, and more!
          </p>
          <button className="w-full py-3 bg-white text-rose-600 rounded-full">
            Learn More
          </button>
        </div>

        {/* Settings Links */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={() => onNavigate('settings')}
            className="w-full py-3 text-left px-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Account Settings
          </button>
          <button
            onClick={() => onNavigate('community')}
            className="w-full py-3 text-left px-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Community & Open Source
          </button>
          <button className="w-full py-3 text-left px-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-red-600">
            Log Out
          </button>
        </div>
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
        <button
          onClick={() => onNavigate('matches')}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle className="w-6 h-6 text-gray-400" />
          <span className="text-xs text-gray-400">Matches</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <User className="w-6 h-6 text-rose-500 fill-rose-500" />
          <span className="text-xs text-rose-500">Profile</span>
        </button>
      </div>
    </div>
  );
}
