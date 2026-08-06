require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      liveKitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || '',
    },
  },
};
