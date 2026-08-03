'use strict';

const MODULE_VERSION = 'AI_DETECTION_CONFIG_V10';
const SUPPORTED_MEDIA_TYPES = Object.freeze(['image', 'audio', 'video']);
const DEFAULT_HIVE_VISUAL_ENDPOINT = 'https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection';
const DEFAULT_HIVE_AUDIO_ENDPOINT = DEFAULT_HIVE_VISUAL_ENDPOINT;
const DEFAULT_HIVE_AUTH_SCHEME = 'Bearer';
const DEFAULT_HIVE_AUDIO_AUTH_SCHEME = 'Bearer';
const DEFAULT_SIGHTENGINE_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const DEFAULT_SIGHTENGINE_MODELS = Object.freeze(['genai']);
const DEFAULT_PUBLIC_AI_GENERATED_THRESHOLD = 0.80;

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function hasSecret(value) {
  return clean(value).length > 0;
}

function positiveInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function threshold(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function createConfig(env) {
  const source = env && typeof env === 'object' ? env : {};
  // Use the same dedicated variable names locally and on Render.
  const hiveVisualKey = clean(source.HIVE_VISUAL_API_KEY);
  // A dedicated audio key is preferred; the visual V3 key remains a safe fallback.
  const hiveAudioKey = clean(source.HIVE_AUDIO_API_KEY) || hiveVisualKey;
  const legacyHiveEndpoint = clean(source.HIVE_API_ENDPOINT);
  const hiveVisualEndpoint = clean(source.HIVE_VISUAL_API_ENDPOINT) || legacyHiveEndpoint || DEFAULT_HIVE_VISUAL_ENDPOINT;
  const hiveAudioEndpoint = clean(source.HIVE_AUDIO_API_ENDPOINT) || DEFAULT_HIVE_AUDIO_ENDPOINT;
  const hiveTimeoutMs = positiveInteger(source.HIVE_API_TIMEOUT_MS, 45000, 5000, 180000);

  const hiveMediaTypes = [];
  if (hasSecret(hiveVisualKey)) hiveMediaTypes.push('image', 'video');
  if (hasSecret(hiveAudioKey)) hiveMediaTypes.push('audio');

  const sightengineApiUser = clean(source.SIGHTENGINE_API_USER);
  const sightengineApiSecret = clean(source.SIGHTENGINE_API_SECRET);
  const sightengineEndpoint = clean(source.SIGHTENGINE_API_ENDPOINT) || DEFAULT_SIGHTENGINE_ENDPOINT;
  const sightengineTimeoutMs = positiveInteger(source.SIGHTENGINE_API_TIMEOUT_MS, 45000, 5000, 180000);
  const sightengineConfigured = hasSecret(sightengineApiUser) && hasSecret(sightengineApiSecret);
  const sightengineMediaTypes = sightengineConfigured ? ['image'] : [];

  const configuredProviders = [];
  if (hiveMediaTypes.length) configuredProviders.push('hive');
  if (sightengineConfigured) configuredProviders.push('sightengine');

  return Object.freeze({
    version: MODULE_VERSION,
    supportedMediaTypes: SUPPORTED_MEDIA_TYPES,
    configuredProviders: Object.freeze(configuredProviders),
    providerConfigured: configuredProviders.length > 0,
    thresholds: Object.freeze({
      publicAiGenerated: threshold(source.AIV_PUBLIC_AI_GENERATED_THRESHOLD, DEFAULT_PUBLIC_AI_GENERATED_THRESHOLD),
      aiGeneratedImage: threshold(source.AIV_AI_IMAGE_THRESHOLD, 0.90),
      aiGeneratedVideo: threshold(source.AIV_AI_VIDEO_THRESHOLD, 0.90),
      aiGeneratedAudio: threshold(source.AIV_AI_AUDIO_THRESHOLD, 0.90),
      deepfakeImage: threshold(source.AIV_DEEPFAKE_IMAGE_THRESHOLD, 0.90),
      deepfakeVideo: threshold(source.AIV_DEEPFAKE_VIDEO_THRESHOLD, 0.50)
    }),
    providers: Object.freeze({
      hive: Object.freeze({
        configured: hiveMediaTypes.length > 0,
        configuredMediaTypes: Object.freeze(Array.from(new Set(hiveMediaTypes))),
        apiVersion: 'v3',
        audioApiVersion: 'v3',
        authScheme: DEFAULT_HIVE_AUTH_SCHEME,
        audioAuthScheme: DEFAULT_HIVE_AUDIO_AUTH_SCHEME,
        endpoint: hiveVisualEndpoint,
        visualEndpoint: hiveVisualEndpoint,
        audioEndpoint: hiveAudioEndpoint,
        timeoutMs: hiveTimeoutMs,
        visualApiKey: hiveVisualKey,
        audioApiKey: hiveAudioKey
      }),
      sightengine: Object.freeze({
        configured: sightengineConfigured,
        configuredMediaTypes: Object.freeze(sightengineMediaTypes),
        apiVersion: '1.0',
        models: DEFAULT_SIGHTENGINE_MODELS,
        endpoint: sightengineEndpoint,
        timeoutMs: sightengineTimeoutMs,
        apiUser: sightengineApiUser,
        apiSecret: sightengineApiSecret
      }),
      realityDefender: Object.freeze({
        configured: hasSecret(source.REALITY_DEFENDER_API_KEY),
        configuredMediaTypes: Object.freeze([])
      })
    })
  });
}

function validateConfig(config) {
  if (!config || config.version !== MODULE_VERSION) {
    throw new Error('AI detection configuration module is missing or incompatible.');
  }
  if (!Array.isArray(config.supportedMediaTypes) || config.supportedMediaTypes.length !== 3) {
    throw new Error('AI detection supported-media configuration is malformed.');
  }
  if (!config.providers || !config.providers.hive || !config.providers.sightengine || !config.thresholds) {
    throw new Error('AI detection provider configuration is malformed.');
  }
  if (config.providers.hive.apiVersion !== 'v3' || config.providers.hive.authScheme !== DEFAULT_HIVE_AUTH_SCHEME || config.providers.hive.audioApiVersion !== 'v3' || config.providers.hive.audioAuthScheme !== DEFAULT_HIVE_AUDIO_AUTH_SCHEME) {
    throw new Error('AI detection Hive media authentication configuration is malformed.');
  }
  if (!clean(config.providers.hive.visualEndpoint) || !clean(config.providers.hive.audioEndpoint)) {
    throw new Error('AI detection Hive media endpoint configuration is malformed.');
  }
  if (config.providers.sightengine.apiVersion !== '1.0' || !Array.isArray(config.providers.sightengine.models) || config.providers.sightengine.models[0] !== 'genai') {
    throw new Error('AI detection Sightengine configuration is malformed.');
  }
  if (config.thresholds.publicAiGenerated !== threshold(config.thresholds.publicAiGenerated, DEFAULT_PUBLIC_AI_GENERATED_THRESHOLD)) {
    throw new Error('AI detection public result threshold is malformed.');
  }
  return true;
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  SUPPORTED_MEDIA_TYPES: SUPPORTED_MEDIA_TYPES,
  DEFAULT_HIVE_ENDPOINT: DEFAULT_HIVE_VISUAL_ENDPOINT,
  DEFAULT_HIVE_VISUAL_ENDPOINT: DEFAULT_HIVE_VISUAL_ENDPOINT,
  DEFAULT_HIVE_AUDIO_ENDPOINT: DEFAULT_HIVE_AUDIO_ENDPOINT,
  DEFAULT_HIVE_AUTH_SCHEME: DEFAULT_HIVE_AUTH_SCHEME,
  DEFAULT_HIVE_AUDIO_AUTH_SCHEME: DEFAULT_HIVE_AUDIO_AUTH_SCHEME,
  DEFAULT_SIGHTENGINE_ENDPOINT: DEFAULT_SIGHTENGINE_ENDPOINT,
  DEFAULT_SIGHTENGINE_MODELS: DEFAULT_SIGHTENGINE_MODELS,
  DEFAULT_PUBLIC_AI_GENERATED_THRESHOLD: DEFAULT_PUBLIC_AI_GENERATED_THRESHOLD,
  createConfig: createConfig,
  validateConfig: validateConfig
});
