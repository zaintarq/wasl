import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Routes } from './routes';
import { MatchListScreen } from '../components/MatchListScreen.native';
import { ChatScreen } from '../components/ChatScreen.native';

const Stack = createNativeStackNavigator();

/**
 * Chats tab stack: conversation list → thread. Back from a thread returns to the list.
 */
export function MatchesStackNavigator({ onNavigateRoot }) {
  return (
    <Stack.Navigator
      initialRouteName="MatchesList"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        presentation: 'card',
      }}
    >
      <Stack.Screen name="MatchesList">
        {({ navigation }) => (
          <MatchListScreen
            onNavigate={(screen, arg) => {
              const matchId =
                arg && typeof arg === 'object' ? arg.matchId : typeof arg === 'string' ? arg : undefined;
              if (screen === 'chat' && matchId) {
                navigation.navigate(Routes.ChatThread, {
                  matchId,
                  userId: arg?.userId || null,
                });
                return;
              }
              onNavigateRoot(screen, arg);
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name={Routes.ChatThread}>
        {({ navigation, route }) => (
          <ChatScreen
            onNavigate={(screen, arg) => {
              if (screen === 'matches') {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('MatchesList');
                }
                return;
              }
              onNavigateRoot(screen, arg);
            }}
            matchId={route?.params?.matchId || null}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
