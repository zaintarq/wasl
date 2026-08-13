require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      liveKitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || '',
      gamesClientUrl: process.env.EXPO_PUBLIC_GAMES_CLIENT_URL || '',
      colyseusWsUrl: process.env.EXPO_PUBLIC_COLYSEUS_WS_URL || '',
      zoiVeraApiKey: process.env.EXPO_PUBLIC_ZOIVERA_API_KEY || '',
      zoiVeraAudience: process.env.EXPO_PUBLIC_ZOIVERA_AUDIENCE || 'https://zaintarq.github.io',
      ageVerifyHostUrl:
        process.env.EXPO_PUBLIC_AGE_VERIFY_HOST_URL ||
        'https://us-central1-huzz-10264.cloudfunctions.net/ageVerifyPage',
    },
  },
};
