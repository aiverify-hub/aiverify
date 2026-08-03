'use strict';

const core = require('./core');

const MODULE_VERSION = 'AI_DETECTION_COORDINATOR_V3';
const CORE_VERSION = 'AI_DETECTION_CORE_V11';

function validateCore() {
  if (!core || core.MODULE_VERSION !== CORE_VERSION || typeof core.createAiDetectionFoundation !== 'function') {
    throw new Error('AI detection core module is missing or incompatible.');
  }
}

function createAiDetectionFoundation(options) {
  validateCore();
  const foundation = core.createAiDetectionFoundation(options);
  if (!foundation || typeof foundation.health !== 'function' || typeof foundation.analyzeMedia !== 'function') {
    throw new Error('AI detection core foundation interface is incomplete.');
  }

  function health() {
    const status = foundation.health();
    return Object.assign({}, status, {
      coordinatorVersion: MODULE_VERSION,
      coordinatorEntryPoint: 'coordinator.js',
      mediaRouting: Object.freeze({
        image: 'core',
        audio: 'core',
        video: 'core-visual-and-soundtrack'
      })
    });
  }

  async function analyzeMedia(payload) {
    return foundation.analyzeMedia(payload);
  }

  async function analyze(payload) {
    if (typeof foundation.analyze === 'function') return foundation.analyze(payload);
    return analyzeMedia(payload);
  }

  return Object.freeze({
    version: MODULE_VERSION,
    health: health,
    analyze: analyze,
    analyzeMedia: analyzeMedia
  });
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  CORE_VERSION: CORE_VERSION,
  createAiDetectionFoundation: createAiDetectionFoundation
});
