/**
 * Storage-triggered NSFW check for profile uploads.
 * Lives in a separate Firebase codebase so heavy tfjs/nsfwjs deps never block
 * deploying OTP/email callables in ../functions.
 */
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const os = require('os');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const COL = { users: 'users' };

const NSFW_THRESHOLD = 0.6;
const DEFAULT_STORAGE_BUCKET = 'huzz-10264.firebasestorage.app';

exports.moderateProfileImage = onObjectFinalized(
  {
    bucket: DEFAULT_STORAGE_BUCKET,
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const object = event.data;
    const filePath = object.name;
    const bucketName = object.bucket;

    if (!filePath || !filePath.startsWith('images/')) {
      return null;
    }

    const pathParts = filePath.split('/');
    if (pathParts.length < 3) {
      return null;
    }

    const userId = pathParts[1];
    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(filePath);
    const tempPath = path.join(os.tmpdir(), path.basename(filePath));

    try {
      await file.download({ destination: tempPath });
      const imageBuffer = fs.readFileSync(tempPath);

      const tf = require('@tensorflow/tfjs-node');
      const nsfwjs = require('nsfwjs');

      const model = await nsfwjs.load();
      const decoded = tf.node.decodeImage(imageBuffer);
      const resized = tf.image.resizeBilinear(decoded, [224, 224]);
      decoded.dispose();

      const predictions = await model.classify(resized);
      resized.dispose();

      const scores = {};
      for (const p of predictions) {
        scores[p.className] = p.probability;
      }

      const porn = scores.Porn || 0;
      const hentai = scores.Hentai || 0;
      const sexy = scores.Sexy || 0;
      const isNsfw = porn >= NSFW_THRESHOLD || hentai >= NSFW_THRESHOLD || sexy >= NSFW_THRESHOLD;

      if (isNsfw) {
        console.log(
          `[moderateProfileImage] NSFW detected: path=${filePath} Porn=${porn.toFixed(2)} Hentai=${hentai.toFixed(2)} Sexy=${sexy.toFixed(2)}`
        );
        await file.delete();

        const pathEncoded = filePath.replace(/\//g, '%2F');
        const userRef = db.collection(COL.users).doc(userId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const data = userSnap.data();
          const images = Array.isArray(data.images) ? data.images : [];
          const filtered = images.filter((url) => typeof url === 'string' && !url.includes(pathEncoded));
          if (filtered.length !== images.length) {
            await userRef.update({ images: filtered });
            console.log(`[moderateProfileImage] Removed NSFW image from user ${userId} profile.`);
          }
        }
      }
    } catch (err) {
      console.error('[moderateProfileImage] Error:', err.message);
    } finally {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        // ignore cleanup errors
      }
    }

    return null;
  }
);
