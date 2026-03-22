import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Routes } from './routes';
import { HomeScreen } from '../components/HomeScreen.native';
import { FiltersScreen } from '../components/FiltersScreen.native';
import { SelectCountryScreen } from '../components/SelectCountryScreen.native';

const Stack = createNativeStackNavigator();

/**
 * Home + Filters + country picker live in one nested stack so transitions are real
 * full-screen pushes (not a root-level sheet/modal that can look like a “popup”).
 */
export function HomeStackNavigator({ onNavigateRoot }) {
  return (
    <Stack.Navigator
      initialRouteName="HomeMain"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        // iOS: explicit card stack (not pageSheet / modal).
        presentation: 'card',
      }}
    >
      <Stack.Screen name="HomeMain">
        {() => <HomeScreen onNavigate={onNavigateRoot} />}
      </Stack.Screen>
      <Stack.Screen name={Routes.Filters}>
        {() => <FiltersScreen onNavigate={onNavigateRoot} />}
      </Stack.Screen>
      <Stack.Screen name={Routes.SelectCountry} component={SelectCountryScreen} />
    </Stack.Navigator>
  );
}
