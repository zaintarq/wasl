import { useState } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { HomeScreen } from './components/HomeScreen';
import { MatchListScreen } from './components/MatchListScreen';
import { ChatScreen } from './components/ChatScreen';
import { ProfileView } from './components/ProfileView';
import { MyProfile } from './components/MyProfile';
import { SettingsScreen } from './components/SettingsScreen';
import { CommunityScreen } from './components/CommunityScreen';

type Screen = 
  | 'welcome'
  | 'onboarding'
  | 'home'
  | 'matches'
  | 'chat'
  | 'profile'
  | 'myProfile'
  | 'settings'
  | 'community';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [onboardingMode, setOnboardingMode] = useState<'signup' | 'login'>('signup');

  const navigateTo = (
    screen: Screen,
    arg?: string | { userId?: string; mode?: 'signup' | 'login' }
  ) => {
    if (typeof arg === 'string') setSelectedUserId(arg);
    if (typeof arg === 'object' && arg?.userId) setSelectedUserId(arg.userId);
    if (screen === 'onboarding') setOnboardingMode(arg && typeof arg === 'object' && arg.mode === 'login' ? 'login' : 'signup');
    setCurrentScreen(screen);
  };

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ background: '#c0c0c0' }}>
      {currentScreen === 'welcome' && <WelcomeScreen onNavigate={navigateTo} />}
      {currentScreen === 'onboarding' && <OnboardingFlow onNavigate={navigateTo} mode={onboardingMode} />}
      {currentScreen === 'home' && <HomeScreen onNavigate={navigateTo} />}
      {currentScreen === 'matches' && <MatchListScreen onNavigate={navigateTo} />}
      {currentScreen === 'chat' && <ChatScreen onNavigate={navigateTo} userId={selectedUserId} />}
      {currentScreen === 'profile' && <ProfileView onNavigate={navigateTo} userId={selectedUserId} />}
      {currentScreen === 'myProfile' && <MyProfile onNavigate={navigateTo} />}
      {currentScreen === 'settings' && <SettingsScreen onNavigate={navigateTo} />}
      {currentScreen === 'community' && <CommunityScreen onNavigate={navigateTo} />}
    </div>
  );
}
