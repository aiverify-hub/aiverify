'use strict';

const detectionConfig = require('./config');
const mediaIntake = require('./media-intake');
const provenance = require('./provenance');
const hiveProvider = require('./provider-hive');
const sightengineProvider = require('./provider-sightengine');
const scoring = require('./scoring');

const MODULE_VERSION = 'AI_DETECTION_CORE_V11';

function unionMediaTypes(config) {
  const names = [];
  ['hive', 'sightengine'].forEach(function (providerName) {
    const provider = config.providers[providerName];
    if (!provider || !Array.isArray(provider.configuredMediaTypes)) return;
    provider.configuredMediaTypes.forEach(function (mediaType) {
      if (names.indexOf(mediaType) < 0) names.push(mediaType);
    });
  });
  return names;
}

function createAiDetectionFoundation(options) {
  const settings = options && typeof options === 'object' ? options : {};
  const backendVersion = String(settings.backendVersion || '').trim();
  if (!backendVersion) throw new Error('AI detection foundation requires the active backend version.');

  const config = detectionConfig.createConfig(settings.env || process.env);
  detectionConfig.validateConfig(config);
  const onProviderOperations = typeof settings.onProviderOperations === 'function' ? settings.onProviderOperations : null;
  const hiveVisualReady = config.providers.hive.configuredMediaTypes.indexOf('video') >= 0;
  const hiveAudioReady = config.providers.hive.configuredMediaTypes.indexOf('audio') >= 0;

  function health() {
    return {
      version: MODULE_VERSION,
      status: 'multi-provider-ready',
      backendVersion: backendVersion,
      liveScanRoutingEnabled: false,
      uploadHandlingEnabled: true,
      provenanceScanEnabled: true,
      provenancePriorityEnabled: true,
      externalContentDetectionEnabled: config.providerConfigured,
      visualOrAudioContentDetectionEnabled: config.providerConfigured,
      videoVisualAnalysisEnabled: hiveVisualReady,
      videoSoundtrackAnalysisEnabled: hiveAudioReady,
      videoAnalysisStage: 'visual-and-soundtrack',
      multiProviderImageDetectionEnabled: config.providers.hive.configured && config.providers.sightengine.configured,
      maxUploadBytes: mediaIntake.MAX_MEDIA_BYTES,
      providerConfigured: config.providerConfigured,
      configuredProviders: config.configuredProviders.slice(),
      configuredMediaTypes: unionMediaTypes(config),
      supportedMediaTypes: config.supportedMediaTypes.slice(),
      publicResultMode: 'simplified',
      publicProviderDetailsHidden: true,
      publicPercentageDetailsHidden: true,
      publicAiGeneratedThreshold: config.thresholds.publicAiGenerated,
      hiveApiVersion: config.providers.hive.apiVersion,
      hiveAuthentication: config.providers.hive.authScheme,
      hiveProviderVersion: hiveProvider.MODULE_VERSION,
      sightengineApiVersion: config.providers.sightengine.apiVersion,
      sightengineProviderVersion: sightengineProvider.MODULE_VERSION,
      sightengineModels: config.providers.sightengine.models.slice(),
      scoringVersion: scoring.MODULE_VERSION,
      modules: {
        coordinator: true,
        configuration: true,
        mediaIntake: true,
        provenance: true,
        hiveProvider: true,
        sightengineProvider: true,
        scoring: true
      }
    };
  }

  function recordOperations(providerResults) {
    if (!onProviderOperations) return;
    try {
      onProviderOperations(providerResults.map(function (provider) {
        const kind = provider.analysisKind || '';
        return {
          provider: provider.provider || '',
          operation: kind === 'soundtrack' ? 'video-soundtrack-analysis' : (kind === 'visual' ? 'visual-media-analysis' : 'media-analysis'),
          actualRequest: provider.attempted === true,
          requestCount: provider.attempted === true ? 1 : 0,
          operations: provider.attempted === true ? 1 : 0,
          status: provider.status || '',
          charge: provider.charge || null,
          taskId: provider.taskId || '',
          error: provider.error || ''
        };
      }));
    } catch (_error) {}
  }

  async function analyzeMedia(payload) {
    const prepared = mediaIntake.prepare(payload);
    const provenanceResult = provenance.inspect(prepared);
    let providerResults;

    if (prepared.mediaType === 'video') {
      providerResults = await Promise.all([
        hiveProvider.analyze(prepared, config, { analysisMediaType: 'video', analysisKind: 'visual', providerName: 'hive-visual' }),
        sightengineProvider.analyze(prepared, config),
        hiveProvider.analyze(prepared, config, { analysisMediaType: 'audio', analysisKind: 'soundtrack', providerName: 'hive-audio' })
      ]);
    } else {
      providerResults = await Promise.all([
        hiveProvider.analyze(prepared, config, {
          analysisMediaType: prepared.mediaType,
          analysisKind: prepared.mediaType === 'audio' ? 'audio' : 'visual',
          providerName: 'hive'
        }),
        sightengineProvider.analyze(prepared, config)
      ]);
    }

    const result = scoring.score({
      mediaType: prepared.mediaType,
      provenance: provenanceResult,
      providers: providerResults,
      thresholds: config.thresholds
    });
    recordOperations(providerResults);

    const summary = result.publicSummary || {};
    const providerInternal = result.internal && result.internal.provider ? result.internal.provider : {};
    return {
      ok: true,
      version: MODULE_VERSION,
      status: result.status,
      answer: result.answer,
      explanation: result.explanation,
      resultLevel: result.resultLevel,
      signals: result.publicSignals.slice(),
      publicSummary: result.publicSummary,
      metadataOnly: result.metadataOnly,
      visualOrAudioContentAnalyzed: result.visualOrAudioContentAnalyzed,
      videoAnalysis: prepared.mediaType === 'video' ? {
        stage: 'visual-and-soundtrack',
        visualFramesAnalyzed: summary.videoVisualCheckCompleted === true,
        soundtrackAnalyzed: summary.videoSoundtrackCheckCompleted === true,
        frameClassifications: Number(providerInternal.frameCount) || 0,
        soundtrackClassifications: Number(providerInternal.soundtrackSegmentCount) || 0
      } : null,
      media: {
        filename: prepared.filename,
        mediaType: prepared.mediaType,
        detectedMimeType: prepared.detectedMimeType,
        declaredMimeType: prepared.declaredMimeType,
        declaredTypeMatches: prepared.declaredTypeMatches,
        sizeBytes: prepared.sizeBytes,
        sha256: prepared.sha256
      }
    };
  }

  async function analyze(payload) {
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
  createAiDetectionFoundation: createAiDetectionFoundation
});
