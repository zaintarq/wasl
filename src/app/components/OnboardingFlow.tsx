import { useState } from 'react';
import { Camera, ArrowRight, Check } from 'lucide-react';

interface OnboardingFlowProps {
  onNavigate: (screen: string, arg?: string | { userId?: string; mode?: 'signup' | 'login' }) => void;
  mode?: 'signup' | 'login';
}

export function OnboardingFlow({ onNavigate }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const interests = [
    'Coffee', 'Travel', 'Music', 'Art', 'Fitness', 'Food',
    'Photography', 'Yoga', 'Gaming', 'Reading', 'Movies', 'Hiking',
    'Tech', 'Dancing', 'Cooking', 'Pets'
  ];

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const nextStep = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onNavigate('home');
    }
  };

  const progress = (step / 4) * 100;

  return (
    <div className="h-full flex flex-col" style={{ background: '#c0c0c0' }}>
      {/* Progress Bar */}
      <div className="w-full h-4 win98-window" style={{ borderRadius: '0' }}>
        <div
          className="h-full transition-all duration-300 retro-green"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="win98-window p-6" style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Step 1: Login Method */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl mb-2 retro-title" style={{ fontSize: '20px', color: '#800020' }}>Welcome to Huzz</h2>
                <p style={{ color: '#000000', fontWeight: 'bold' }}>How would you like to sign up?</p>
              </div>

              <div className="space-y-3">
                <button className="win98-button w-full py-3 retro-blue flex items-center justify-center gap-3" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  <span>📧</span>
                  <span>Continue with Email</span>
                </button>
                <button className="win98-button w-full py-3 retro-pink flex items-center justify-center gap-3" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  <span>📱</span>
                  <span>Continue with Phone</span>
                </button>
                <button className="win98-button w-full py-3 retro-yellow flex items-center justify-center gap-3" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  <span>🔍</span>
                  <span>Continue with Google</span>
                </button>
                <button className="win98-button w-full py-3 retro-light-blue flex items-center justify-center gap-3" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  <span>🍎</span>
                  <span>Continue with Apple</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Profile Photo */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl mb-2 retro-title" style={{ fontSize: '20px', color: '#800020' }}>Add your photos</h2>
                <p style={{ color: '#000000', fontWeight: 'bold' }}>Upload at least 2 photos to continue</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="win98-window aspect-square flex items-center justify-center cursor-pointer"
                    style={{ background: i % 2 === 0 ? '#ffc0cb' : '#87ceeb' }}
                  >
                    <Camera className="w-8 h-8" style={{ color: '#000000' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Basic Info */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl mb-2 retro-title" style={{ fontSize: '20px', color: '#800020' }}>About you</h2>
                <p style={{ color: '#000000', fontWeight: 'bold' }}>Tell us a bit about yourself</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>First Name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    className="win98-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>Age</label>
                  <input
                    type="number"
                    placeholder="18"
                    className="win98-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>Gender</label>
                  <select className="win98-input w-full">
                    <option>Select gender</option>
                    <option>Woman</option>
                    <option>Man</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>Interested in</label>
                  <select className="win98-input w-full">
                    <option>Select preference</option>
                    <option>Women</option>
                    <option>Men</option>
                    <option>Everyone</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Interests */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl mb-2 retro-title" style={{ fontSize: '20px', color: '#800020' }}>Your interests</h2>
                <p style={{ color: '#000000', fontWeight: 'bold' }}>Select at least 5 interests</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {interests.map((interest, index) => {
                  const colors = ['#00ff00', '#ffc0cb', '#0080ff', '#87ceeb', '#ffff00', '#800020'];
                  const color = colors[index % colors.length];
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className="win98-button px-3 py-2"
                      style={{
                        background: isSelected ? color : '#c0c0c0',
                        color: isSelected && color === '#800020' ? '#ffffff' : '#000000',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      {interest}
                      {isSelected && (
                        <Check className="w-3 h-3 inline ml-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ color: '#000000', fontWeight: 'bold' }}>Bio (optional)</label>
                <textarea
                  placeholder="Tell people about yourself..."
                  rows={4}
                  className="win98-input w-full resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Next Button */}
      <div className="p-4" style={{ background: '#c0c0c0' }}>
        <button
          onClick={nextStep}
          className="win98-button w-full py-3 retro-burgundy flex items-center justify-center gap-2"
          style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}
        >
          <span>{step === 4 ? 'Complete Profile' : 'Continue'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
