import { Heart } from 'lucide-react';

interface WelcomeScreenProps {
  onNavigate: (screen: string, arg?: string | { userId?: string; mode?: 'signup' | 'login' }) => void;
}

export function WelcomeScreen({ onNavigate }: WelcomeScreenProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6" style={{ 
      background: 'linear-gradient(135deg, #87ceeb 0%, #ffc0cb 25%, #00ff00 50%, #ffff00 75%, #0080ff 100%)',
      backgroundSize: '400% 400%',
      animation: 'gradientShift 8s ease infinite'
    }}>
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      
      <div className="win98-window p-8 mb-8" style={{ maxWidth: '400px', width: '100%' }}>
        <div className="flex flex-col items-center mb-8">
          <div className="win98-window p-6 mb-6" style={{ background: '#ffff00' }}>
            <Heart className="w-16 h-16" style={{ color: '#ff00ff', fill: '#ff00ff' }} />
          </div>
          <h1 className="retro-title mb-4" style={{ 
            color: '#800020',
            textShadow: '2px 2px 0px #000000',
            fontSize: '32px'
          }}>
            HUZZ
          </h1>
          <p className="text-center mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>
            Connect authentically. Date freely.
          </p>
          <p className="text-sm" style={{ color: '#808080' }}>
            Open-source & community-driven
          </p>
        </div>

        <div className="w-full space-y-3">
          <button
            onClick={() => onNavigate('onboarding', { mode: 'signup' })}
            className="win98-button w-full py-3 retro-green"
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          >
            Sign Up
          </button>
          <button
            onClick={() => onNavigate('onboarding', { mode: 'login' })}
            className="win98-button w-full py-3 retro-light-blue"
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          >
            Log In
          </button>
        </div>
      </div>

      <div className="mt-8 text-xs text-center win98-window p-3" style={{ maxWidth: '400px' }}>
        <p style={{ color: '#000000' }}>
          By continuing, you agree to our Terms & Privacy Policy
        </p>
      </div>
    </div>
  );
}