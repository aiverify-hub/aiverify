'use strict';

const MODULE_VERSION = 'AI_DETECTION_SIGHTENGINE_PROVIDER_V1';

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function numericScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

function sourceLabelScore(payload) {
  const type = payload && payload.type && typeof payload.type === 'object' ? payload.type : {};
  const generators = type.ai_generators && typeof type.ai_generators === 'object' ? type.ai_generators : {};
  let sourceClass = '';
  let sourceScore = null;
  Object.keys(generators).forEach(function (name) {
    const score = numericScore(generators[name]);
    if (score == null) return;
    if (sourceScore == null || score > sourceScore) {
      sourceClass = clean(name).toLowerCase();
      sourceScore = score;
    }
  });
  return { sourceClass: sourceClass, sourceScore: sourceScore };
}

function responseErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const direct = clean(payload.error || payload.message || payload.detail || payload.error_message);
  if (direct) return direct;
  return fallback;
}

function emptyResult(status, attempted, configured, error) {
  return Object.freeze({
    version: MODULE_VERSION,
    provider: 'sightengine',
    attempted: attempted,
    configured: configured,
    status: status,
    contentAnalyzed: false,
    frameCount: 0,
    aiGeneratedScore: null,
    notAiGeneratedScore: null,
    deepfakeScore: null,
    sourceClass: '',
    sourceScore: null,
    charge: null,
    taskId: '',
    error: error || ''
  });
}

async function analyze(preparedMedia, config) {
  if (!preparedMedia || !Buffer.isBuffer(preparedMedia.buffer)) {
    throw new Error('Sightengine provider requires validated media bytes.');
  }
  const sightConfig = config && config.providers && config.providers.sightengine;
  if (!sightConfig || !sightConfig.configured) return emptyResult('NOT_CONFIGURED', false, false, '');
  if (preparedMedia.mediaType !== 'image') return emptyResult('NOT_APPLICABLE', false, true, '');
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw new Error('This Node.js version does not support the required media upload interface.');
  }

  const controller = new AbortController();
  const timeoutMs = Number(sightConfig.timeoutMs) || 45000;
  const timeout = setTimeout(function () { controller.abort(); }, timeoutMs);

  try {
    const form = new FormData();
    form.append('media', new Blob([preparedMedia.buffer], { type: preparedMedia.detectedMimeType }), preparedMedia.filename);
    form.append('models', Array.isArray(sightConfig.models) ? sightConfig.models.join(',') : 'genai');
    form.append('api_user', clean(sightConfig.apiUser));
    form.append('api_secret', clean(sightConfig.apiSecret));

    const response = await fetch(sightConfig.endpoint, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: form,
      signal: controller.signal
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_error) { payload = {}; }
    if (!response.ok || clean(payload.status).toLowerCase() !== 'success') {
      throw new Error(responseErrorMessage(payload, 'Sightengine image analysis returned HTTP ' + response.status + '.'));
    }

    const type = payload.type && typeof payload.type === 'object' ? payload.type : {};
    const aiGeneratedScore = numericScore(type.ai_generated);
    if (aiGeneratedScore == null) {
      throw new Error('Sightengine returned no usable AI-generated image score.');
    }
    const source = sourceLabelScore(payload);
    const request = payload.request && typeof payload.request === 'object' ? payload.request : {};

    return Object.freeze({
      version: MODULE_VERSION,
      provider: 'sightengine',
      attempted: true,
      configured: true,
      status: 'COMPLETED',
      contentAnalyzed: true,
      frameCount: 1,
      aiGeneratedScore: aiGeneratedScore,
      notAiGeneratedScore: null,
      deepfakeScore: null,
      sourceClass: source.sourceClass,
      sourceScore: source.sourceScore,
      charge: Number.isFinite(Number(request.operations)) ? String(Number(request.operations)) + ' operation(s)' : null,
      taskId: clean(request.id),
      error: ''
    });
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Sightengine image analysis timed out.'
      : clean(error && error.message || error) || 'Sightengine image analysis failed.';
    return emptyResult('FAILED', true, true, message);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  analyze: analyze
});
