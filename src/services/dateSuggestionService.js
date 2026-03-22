import { userService, datePlanService } from './firebaseService';

/**
 * AI Date Suggestion Service
 * Uses user interests, location, budget to suggest date ideas
 * TODO: Integrate with actual AI API (OpenAI, Anthropic, etc.)
 * TODO: Integrate with weather API (OpenWeatherMap)
 * TODO: Integrate with restaurant/activity APIs (Yelp, Google Places, Eventbrite)
 */
export const dateSuggestionService = {
  // Suggest date plans for a match
  async suggestPlans(matchId, userId) {
    try {
      // Get both users' profiles
      const parts = String(matchId).split('_');
      const otherUid = parts.find((p) => p && p !== userId) || null;
      if (!otherUid) {
        return [];
      }

      const [userRes, otherRes] = await Promise.all([
        userService.getUserById(userId),
        userService.getUserById(otherUid),
      ]);

      const userProfile = userRes?.data || {};
      const otherProfile = otherRes?.data || {};

      // Get common interests
      const userInterests = Array.isArray(userProfile.interests) ? userProfile.interests : [];
      const otherInterests = Array.isArray(otherProfile.interests) ? otherProfile.interests : [];
      const commonInterests = userInterests.filter((i) => otherInterests.includes(i));

      // Get location
      const city = userProfile.city || otherProfile.city || '';
      const country = userProfile.country || otherProfile.country || '';

      // Generate suggestions based on interests and location
      const suggestions = this.generateSuggestions(commonInterests, city, country);

      return suggestions;
    } catch (error) {
      console.error('[DateSuggestion] Error suggesting plans:', error);
      return [];
    }
  },

  // Generate date suggestions (mock AI for now)
  generateSuggestions(interests, city, country) {
    const suggestions = [];

    // Default suggestions if no common interests
    if (interests.length === 0) {
      suggestions.push({
        title: 'Coffee & Conversation',
        description: 'Start with a casual coffee meetup to get to know each other better.',
        activityType: 'Coffee',
        estimatedCost: 15,
        location: { name: 'Local Coffee Shop', address: city || 'Your city' },
      });
      suggestions.push({
        title: 'Evening Walk',
        description: 'Take a relaxing walk in a park or scenic area.',
        activityType: 'Outdoor',
        estimatedCost: 0,
        location: { name: 'Local Park', address: city || 'Your city' },
      });
      return suggestions;
    }

    // Generate based on interests
    if (interests.includes('Food') || interests.includes('Cooking')) {
      suggestions.push({
        title: 'Dinner Date',
        description: 'Try a new restaurant together. Explore local cuisine!',
        activityType: 'Dinner',
        estimatedCost: 50,
        location: { name: 'Local Restaurant', address: city || 'Your city' },
      });
    }

    if (interests.includes('Movies') || interests.includes('Entertainment')) {
      suggestions.push({
        title: 'Movie Night',
        description: 'Catch a movie and discuss it over drinks afterward.',
        activityType: 'Entertainment',
        estimatedCost: 30,
        location: { name: 'Cinema', address: city || 'Your city' },
      });
    }

    if (interests.includes('Outdoor') || interests.includes('Nature')) {
      suggestions.push({
        title: 'Nature Walk',
        description: 'Explore a local park or nature trail together.',
        activityType: 'Outdoor',
        estimatedCost: 0,
        location: { name: 'Nature Trail', address: city || 'Your city' },
      });
    }

    if (interests.includes('Art') || interests.includes('Culture')) {
      suggestions.push({
        title: 'Museum Visit',
        description: 'Visit a local museum or art gallery.',
        activityType: 'Cultural',
        estimatedCost: 25,
        location: { name: 'Museum', address: city || 'Your city' },
      });
    }

    // Always add a few generic suggestions
    if (suggestions.length < 3) {
      suggestions.push({
        title: 'Picnic in the Park',
        description: 'Pack a lunch and enjoy a picnic together.',
        activityType: 'Outdoor',
        estimatedCost: 20,
        location: { name: 'Local Park', address: city || 'Your city' },
      });
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  },

  // Check weather for a date (placeholder)
  async checkWeather(location, date) {
    try {
      // TODO: Integrate with OpenWeatherMap API
      // For now, return mock data
      return {
        checked: true,
        forecast: 'Sunny, 72°F',
        suitable: true,
      };
    } catch (error) {
      console.error('[DateSuggestion] Weather check error:', error);
      return {
        checked: false,
        forecast: '',
        suitable: false,
      };
    }
  },
};
