import { useState } from 'react';
import { ArrowLeft, Heart, X, Flag, Ban, MapPin } from 'lucide-react';
import { users } from '../data/mockData';

interface ProfileViewProps {
  onNavigate: (screen: string) => void;
  userId: string | null;
}

export function ProfileView({ onNavigate, userId }: ProfileViewProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <p className="text-gray-500">User not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-4">
        <button
          onClick={() => onNavigate('chat', user.id)}
          className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
        >
          <ArrowLeft className="w-6 h-6 text-gray-800" />
        </button>
      </div>

      {/* Image Gallery */}
      <div className="relative flex-1">
        <img
          src={user.images[currentImageIndex]}
          alt={user.name}
          className="w-full h-full object-cover"
        />

        {/* Image Indicators */}
        <div className="absolute top-16 left-0 right-0 flex gap-1 px-4">
          {user.images.map((_, index) => (
            <div
              key={index}
              className={`flex-1 h-1 rounded-full ${
                index === currentImageIndex ? 'bg-white' : 'bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Tap Areas for Navigation */}
        <div className="absolute inset-0 flex">
          <button
            onClick={() =>
              setCurrentImageIndex(Math.max(0, currentImageIndex - 1))
            }
            className="flex-1"
          />
          <button
            onClick={() =>
              setCurrentImageIndex(
                Math.min(user.images.length - 1, currentImageIndex + 1)
              )
            }
            className="flex-1"
          />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* User Info */}
      <div className="px-6 py-6 max-h-[45%] overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl">{user.name}</h1>
          <span className="text-2xl text-gray-600">{user.age}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-600 mb-4">
          <MapPin className="w-4 h-4" />
          <span>{user.location}</span>
          <span>•</span>
          <span>{user.distance} km away</span>
        </div>

        <div className="mb-6">
          <h3 className="text-sm text-gray-500 mb-2">About</h3>
          <p className="text-gray-800">{user.bio}</p>
        </div>

        <div>
          <h3 className="text-sm text-gray-500 mb-3">Interests</h3>
          <div className="flex flex-wrap gap-2">
            {user.interests.map((interest) => (
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

      {/* Action Buttons */}
      <div className="p-6 bg-white border-t border-gray-200">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => onNavigate('home')}
            className="w-14 h-14 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center shadow-lg"
          >
            <X className="w-7 h-7 text-gray-600" />
          </button>

          <button className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg">
            <Heart className="w-8 h-8 text-white fill-white" />
          </button>

          <button className="w-12 h-12 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center shadow-lg">
            <Flag className="w-5 h-5 text-gray-600" />
          </button>

          <button className="w-12 h-12 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center shadow-lg">
            <Ban className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
