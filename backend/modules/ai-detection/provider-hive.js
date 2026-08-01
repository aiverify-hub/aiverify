'use strict';

const MODULE_VERSION = 'AI_DETECTION_HIVE_PROVIDER_V7';

function clean(value) {
  return String(value == null ? '' : value).trim();
}


function safeDiagnosticText(value, apiKey) {
  let text = clean(value);
  if (!text) return '';
  if (apiKey) text = text.split(apiKey).join('[redacted-key]');
  text = text
    .replace(/(authorization|api[_-]?key|token|secret)(\s*[=:]\s*|\s+)[^\s,;"'}]+/gi, '$1$2[redacted]')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 900);
  return text;
}

function logAudioDiagnostic(details) {
  if (!details || details.mediaType !== 'audio') return;
  const parts = [
    'stage=' + clean(details.stage || 'unknown'),
    'http=' + (details.httpStatus == null ? 'none' : String(details.httpStatus)),
    'content-type=' + clean(details.contentType || 'unknown')
  ];
  const message = safeDiagnosticText(details.message, details.apiKey);
  const body = safeDiagnosticText(details.body, details.apiKey);
  if (message) parts.push('message=' + message);
  if (body) parts.push('response=' + body);
  console.error('AIV Hive audio diagnostic: ' + parts.join(' | '));
}

function numericScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

function maxScore(current, candidate) {
  if (candidate == null) return current;
  if (current == null || candidate > current) return candidate;
  return current;
}

function providerKeyForMedia(hiveConfig, mediaType) {
  if (!hiveConfig) return '';
  return mediaType === 'audio' ? clean(hiveConfig.audioApiKey) : clean(hiveConfig.visualApiKey);
}

function endpointForMedia(hiveConfig, mediaType) {
  if (!hiveConfig) return '';
  if (mediaType === 'audio') return clean(hiveConfig.audioEndpoint);
  return clean(hiveConfig.visualEndpoint || hiveConfig.endpoint);
}

function authSchemeForMedia(hiveConfig, mediaType) {
  if (!hiveConfig) return '';
  if (mediaType === 'audio') return clean(hiveConfig.audioAuthScheme) || 'Token';
  return clean(hiveConfig.authScheme) || 'Bearer';
}

function responseErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const direct = clean(payload.error || payload.message || payload.detail || payload.error_message);
  if (direct) return direct;
  const statuses = Array.isArray(payload.status) ? payload.status : [];
  for (let i = 0; i < statuses.length; i += 1) {
    const entry = statuses[i] || {};
    const status = entry.status && typeof entry.status === 'object' ? entry.status : {};
    const message = clean(status.message || status.detail || entry.message);
    if (message && !/^success$/i.test(message)) return message;
  }
  return fallback;
}

function collectClassFrames(payload) {
  const frames = [];
  const seen = new Set();

  function visit(node, inheritedTime, depth) {
    if (!node || depth > 14) return;
    if (Array.isArray(node)) {
      node.forEach(function (entry) { visit(entry, inheritedTime, depth + 1); });
      return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    const ownTime = Number.isFinite(Number(node.time)) ? Number(node.time) : inheritedTime;
    if (Array.isArray(node.classes)) {
      frames.push({
        time: ownTime == null ? null : ownTime,
        startTime: Number.isFinite(Number(node.start_time)) ? Number(node.start_time) : null,
        endTime: Number.isFinite(Number(node.end_time)) ? Number(node.end_time) : null,
        classes: node.classes
      });
    }

    Object.keys(node).forEach(function (key) {
      if (key === 'classes') return;
      const value = node[key];
      if (value && (typeof value === 'object' || Array.isArray(value))) {
        visit(value, ownTime, depth + 1);
      }
    });
  }

  visit(payload, null, 0);
  return frames;
}

function findFirstValue(payload, keys) {
  const wanted = new Set(keys);
  const seen = new Set();
  let found = null;

  function visit(node, depth) {
    if (found != null || !node || depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach(function (entry) { visit(entry, depth + 1); });
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    const names = Object.keys(node);
    for (let i = 0; i < names.length; i += 1) {
      const key = names[i];
      if (wanted.has(key) && node[key] != null && clean(node[key])) {
        found = clean(node[key]);
        return;
      }
    }
    names.forEach(function (key) {
      const value = node[key];
      if (value && typeof value === 'object') visit(value, depth + 1);
    });
  }

  visit(payload, 0);
  return found;
}

function collectOutput(payload) {
  return {
    frames: collectClassFrames(payload),
    charge: findFirstValue(payload, ['charge', 'cost', 'price'])
  };
}

function summarizeClasses(frames) {
  const scores = Object.create(null);
  frames.forEach(function (frame) {
    const classes = Array.isArray(frame.classes) ? frame.classes : [];
    classes.forEach(function (entry) {
      const className = clean(entry && (entry.class || entry.label || entry.name)).toLowerCase();
      const score = numericScore(entry && (entry.value != null ? entry.value : (entry.score != null ? entry.score : entry.confidence)));
      if (!className || score == null) return;
      scores[className] = maxScore(scores[className], score);
    });
  });

  const excludedSources = new Set([
    'ai_generated', 'not_ai_generated', 'deepfake', 'not_deepfake',
    'yes_deepfake', 'no_deepfake', 'ai_generated_audio', 'not_ai_generated_audio',
    'ai_generated_music', 'not_ai_generated_music', 'ai_generated_music_cover',
    'not_ai_generated_music_cover', 'none', 'inconclusive', 'inconclusive_video',
    'other_image_generators'
  ]);
  let sourceClass = '';
  let sourceScore = null;
  Object.keys(scores).forEach(function (name) {
    if (excludedSources.has(name)) return;
    if (sourceScore == null || scores[name] > sourceScore) {
      sourceClass = name;
      sourceScore = scores[name];
    }
  });

  const aiGeneratedScore = [
    scores.ai_generated,
    scores.ai_generated_audio,
    scores.ai_generated_music,
    scores.ai_generated_music_cover
  ].reduce(maxScore, null);
  const notAiGeneratedScore = [
    scores.not_ai_generated,
    scores.not_ai_generated_audio,
    scores.not_ai_generated_music,
    scores.not_ai_generated_music_cover
  ].reduce(maxScore, null);
  const deepfakeScore = [scores.deepfake, scores.yes_deepfake].reduce(maxScore, null);

  return {
    aiGeneratedScore: aiGeneratedScore,
    notAiGeneratedScore: notAiGeneratedScore,
    deepfakeScore: deepfakeScore,
    sourceClass: sourceClass,
    sourceScore: sourceScore,
    classScores: scores
  };
}

function emptyResult(status, attempted, configured, error) {
  return Object.freeze({
    version: MODULE_VERSION,
    provider: 'hive',
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
    throw new Error('Hive provider requires validated media bytes.');
  }
  const hiveConfig = config && config.providers && config.providers.hive;
  const apiKey = providerKeyForMedia(hiveConfig, preparedMedia.mediaType);
  const endpoint = endpointForMedia(hiveConfig, preparedMedia.mediaType);
  const authScheme = authSchemeForMedia(hiveConfig, preparedMedia.mediaType);
  if (!apiKey) return emptyResult('NOT_CONFIGURED', false, false, '');
  if (!endpoint) return emptyResult('FAILED', false, true, 'Hive media endpoint is not configured.');
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw new Error('This Node.js version does not support the required media upload interface.');
  }

  const controller = new AbortController();
  const timeoutMs = Number(hiveConfig.timeoutMs) || 45000;
  const timeout = setTimeout(function () { controller.abort(); }, timeoutMs);
  let audioDiagnosticLogged = false;

  try {
    const form = new FormData();
    form.append('media', new Blob([preparedMedia.buffer], { type: preparedMedia.detectedMimeType }), preparedMedia.filename);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: authScheme + ' ' + apiKey
      },
      body: form,
      signal: controller.signal
    });
    const text = await response.text();
    const contentType = clean(response.headers && response.headers.get ? response.headers.get('content-type') : '');
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_error) { payload = {}; }
    if (!response.ok) {
      const responseMessage = responseErrorMessage(payload, 'Hive ' + preparedMedia.mediaType + ' analysis returned HTTP ' + response.status + '.');
      logAudioDiagnostic({
        mediaType: preparedMedia.mediaType,
        stage: 'http-response',
        httpStatus: response.status,
        contentType: contentType,
        message: responseMessage,
        body: text,
        apiKey: apiKey
      });
      audioDiagnosticLogged = preparedMedia.mediaType === 'audio';
      throw new Error(responseMessage);
    }

    const collected = collectOutput(payload);
    const summary = summarizeClasses(collected.frames);
    if (!collected.frames.length) {
      const classificationMessage = responseErrorMessage(payload, 'Hive ' + preparedMedia.mediaType + ' analysis returned no usable classifications.');
      logAudioDiagnostic({
        mediaType: preparedMedia.mediaType,
        stage: 'classification-parse',
        httpStatus: response.status,
        contentType: contentType,
        message: classificationMessage,
        body: text,
        apiKey: apiKey
      });
      audioDiagnosticLogged = preparedMedia.mediaType === 'audio';
      throw new Error(classificationMessage);
    }

    return Object.freeze({
      version: MODULE_VERSION,
      provider: 'hive',
      attempted: true,
      configured: true,
      status: 'COMPLETED',
      contentAnalyzed: true,
      frameCount: collected.frames.length,
      aiGeneratedScore: summary.aiGeneratedScore,
      notAiGeneratedScore: summary.notAiGeneratedScore,
      deepfakeScore: summary.deepfakeScore,
      sourceClass: summary.sourceClass,
      sourceScore: summary.sourceScore,
      charge: collected.charge,
      taskId: findFirstValue(payload, ['id', 'task_id', 'request_id']) || '',
      error: ''
    });
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Hive ' + preparedMedia.mediaType + ' analysis timed out.'
      : clean(error && error.message || error) || 'Hive ' + preparedMedia.mediaType + ' analysis failed.';
    if (preparedMedia.mediaType === 'audio' && error && error.name === 'AbortError') {
      logAudioDiagnostic({
        mediaType: preparedMedia.mediaType,
        stage: 'timeout',
        httpStatus: null,
        contentType: '',
        message: message,
        body: '',
        apiKey: apiKey
      });
    } else if (preparedMedia.mediaType === 'audio' && !audioDiagnosticLogged) {
      logAudioDiagnostic({
        mediaType: preparedMedia.mediaType,
        stage: 'request-error',
        httpStatus: null,
        contentType: '',
        message: message,
        body: '',
        apiKey: apiKey
      });
    }
    return emptyResult('FAILED', true, true, message);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  analyze: analyze,
  collectOutput: collectOutput,
  summarizeClasses: summarizeClasses,
  endpointForMedia: endpointForMedia,
  authSchemeForMedia: authSchemeForMedia
});
