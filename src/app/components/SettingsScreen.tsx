import { ArrowLeft, ChevronRight, Moon, Bell, Shield, Lock, CircleHelp, Book } from 'lucide-react';
import { useState } from 'react';

interface SettingsScreenProps {
  onNavigate: (screen: string) => void;
}

export function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 bg-white border-b border-gray-200">
        <button onClick={() => onNavigate('myProfile')}>
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Account Section */}
        <div className="mt-4 bg-white">
          <div className="px-6 py-3">
            <h2 className="text-sm text-gray-500">ACCOUNT</h2>
          </div>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <span>Phone Number</span>
            <div className="flex items-center gap-2 text-gray-500">
              <span className="text-sm">+1 (555) 123-4567</span>
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <span>Email</span>
            <div className="flex items-center gap-2 text-gray-500">
              <span className="text-sm">user@example.com</span>
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <span>Change Password</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Privacy Section */}
        <div className="mt-6 bg-white">
          <div className="px-6 py-3">
            <h2 className="text-sm text-gray-500">PRIVACY & SAFETY</h2>
          </div>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-600" />
              <span>Privacy Settings</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-gray-600" />
              <span>Blocked Users</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <Book className="w-5 h-5 text-gray-600" />
              <span>Community Guidelines</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Preferences Section */}
        <div className="mt-6 bg-white">
          <div className="px-6 py-3">
            <h2 className="text-sm text-gray-500">PREFERENCES</h2>
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-gray-600" />
              <span>Push Notifications</span>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                notifications ? 'bg-rose-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  notifications ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-gray-600" />
              <span>Dark Mode</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                darkMode ? 'bg-rose-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  darkMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <span>Discovery Settings</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Support Section */}
        <div className="mt-6 bg-white">
          <div className="px-6 py-3">
            <h2 className="text-sm text-gray-500">SUPPORT</h2>
          </div>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <CircleHelp className="w-5 h-5 text-gray-600" />
              <span>Help & Support</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button
            onClick={() => onNavigate('community')}
            className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50"
          >
            <span>Open Source Community</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* About Section */}
        <div className="mt-6 bg-white mb-6">
          <button className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50">
            <span>Terms of Service</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-100 hover:bg-gray-50">
            <span>Privacy Policy</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <div className="px-6 py-4 border-t border-gray-100 text-center text-sm text-gray-500">
            Version 1.0.0
          </div>
        </div>
      </div>
    </div>
  );
}