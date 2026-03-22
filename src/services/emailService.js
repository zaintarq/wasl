/**
 * Email Service
 * Sends emails via Firebase Cloud Functions or external email service
 * 
 * NOTE: This requires a backend service (Firebase Cloud Functions, SendGrid, etc.)
 * For now, this is a placeholder that you'll need to connect to your email service.
 */

/**
 * Send wali invitation email
 * @param {string} waliEmail - The wali's email address
 * @param {string} waliName - The wali's name
 * @param {string} userName - The user who is inviting the wali
 * @param {string} appDownloadLink - Link to download the app
 * @param {string} waliHash - Unique hash for wali login
 * @param {string} senderEmail - Sender's email for recognition
 * @param {string} senderName - Sender's name for recognition
 */
export async function sendWaliInvitationEmail({ waliEmail, waliName, userName, appDownloadLink, waliHash, senderEmail, senderName }) {
  try {
    // Use Firebase Cloud Function to send email
    const PROJECT_ID = 'huzz-10264';
    const REGION = 'us-central1';
    
    const CLOUD_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/sendWaliInvitation`;
    
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: waliEmail,
        waliName,
        userName,
        appDownloadLink: appDownloadLink || getAppDownloadLink(),
        waliHash,
        senderEmail: senderEmail || userName || '',
        senderName: senderName || userName || 'Someone',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Email service returned ${response.status}: ${errorText}`);
    }

    return { error: null };
  } catch (error) {
    console.error('[EmailService] Failed to send wali invitation:', error);
    return { error: error.message || 'Failed to send email' };
  }
}

/**
 * Generate a special signup link for wali
 * This link should pre-fill the email and set a flag to indicate wali signup
 */
export function generateWaliSignupLink(waliEmail) {
  // Encode the email in the URL
  const encodedEmail = encodeURIComponent(waliEmail);
  // Use deep link format that the app can handle
  // The app will parse this and pre-fill the email in OnboardingFlow
  return `huzz://signup?email=${encodedEmail}&role=wali`;
}

/**
 * Get the app download link (APK from Expo EAS)
 */
export function getAppDownloadLink() {
  // Expo EAS build link - users can download APK from here
  return 'https://expo.dev/accounts/zaintariq/projects/huzz/builds/b910d29d-a7a7-4fdb-a9f4-3ca35d8793bc';
}
