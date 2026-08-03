import dotenv from 'dotenv';
dotenv.config();

const env = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const bool = (key, fallback = false) => {
  const v = env(key, String(fallback)).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
};

export const config = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', '').replace(/\/$/, ''),

  auth: {
    // Shared password for the Smart 1 team. Reviewers never need it — their
    // link carries a per-project token instead.
    password: env('STUDIO_PASSWORD'),
    secret: env('SESSION_SECRET', 'change-me-in-production'),
    sessionDays: Number(env('SESSION_DAYS', '14'))
  },

  openai: {
    key: env('OPENAI_API_KEY'),
    base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    textModel: env('OPENAI_MODEL', 'gpt-4o'),
    imageModel: env('OPENAI_IMAGE_MODEL', 'gpt-image-1')
  },

  brandfetch: {
    key: env('BRANDFETCH_API_KEY'),
    base: 'https://api.brandfetch.io/v2'
  },

  elevenlabs: {
    key: env('ELEVENLABS_API_KEY'),
    base: 'https://api.elevenlabs.io/v1',
    model: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2'),
    musicModel: env('ELEVENLABS_MUSIC_MODEL', 'music_v2')
  },

  cloudinary: {
    cloudName: env('CLOUDINARY_CLOUD_NAME'),
    apiKey: env('CLOUDINARY_API_KEY'),
    apiSecret: env('CLOUDINARY_API_SECRET'),
    rootFolder: env('CLOUDINARY_ROOT_FOLDER', 'smart1-radio-studio'),
    // Upload licensed music beds here and they show up as choices in the studio.
    bedFolder: env('CLOUDINARY_BED_FOLDER', 'smart1-radio-studio/music-beds')
  },

  ghl: {
    opportunityWebhook: env('GHL_OPPORTUNITY_WEBHOOK_URL'),
    approvalWebhook: env('GHL_APPROVAL_WEBHOOK_URL'),
    // Fires when the reviewer actually clicks approve or asks for changes.
    responseWebhook: env('GHL_APPROVAL_RESPONSE_WEBHOOK_URL')
  },

  audio: {
    enabled: bool('AUDIO_POST_ENABLED', true),
    targetLufs: Number(env('AUDIO_TARGET_LUFS', '-16')),
    truePeak: Number(env('AUDIO_TRUE_PEAK', '-1.5')),
    bedDb: Number(env('AUDIO_BED_DB', '-17'))
  },

  dataDir: env('DATA_DIR', './data')
};

export const missingKeys = () => {
  const checks = {
    STUDIO_PASSWORD: config.auth.password,
    SESSION_SECRET: config.auth.secret === 'change-me-in-production' ? '' : config.auth.secret,
    OPENAI_API_KEY: config.openai.key,
    BRANDFETCH_API_KEY: config.brandfetch.key,
    ELEVENLABS_API_KEY: config.elevenlabs.key,
    CLOUDINARY_CLOUD_NAME: config.cloudinary.cloudName,
    CLOUDINARY_API_KEY: config.cloudinary.apiKey,
    CLOUDINARY_API_SECRET: config.cloudinary.apiSecret,
    GHL_OPPORTUNITY_WEBHOOK_URL: config.ghl.opportunityWebhook,
    GHL_APPROVAL_WEBHOOK_URL: config.ghl.approvalWebhook
  };
  return Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
};
