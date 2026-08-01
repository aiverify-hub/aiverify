'use strict';

const MODULE_VERSION = 'AI_DETECTION_SCORING_V7';

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function numeric(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

function average(values) {
  const numbers = values.map(numeric).filter(function (value) { return value != null; });
  if (!numbers.length) return null;
  return numbers.reduce(function (total, value) { return total + value; }, 0) / numbers.length;
}

function maximum(values) {
  return values.reduce(function (current, value) {
    const number = numeric(value);
    if (number == null) return current;
    return current == null || number > current ? number : current;
  }, null);
}

function minimum(values) {
  return values.reduce(function (current, value) {
    const number = numeric(value);
    if (number == null) return current;
    return current == null || number < current ? number : current;
  }, null);
}

function unique(values) {
  return values.filter(function (value, index, list) {
    return value && list.indexOf(value) === index;
  });
}

function threshold(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function aiThresholdFor(mediaType, thresholds) {
  const source = thresholds || {};
  if (mediaType === 'video') return threshold(source.aiGeneratedVideo, 0.90);
  if (mediaType === 'audio') return threshold(source.aiGeneratedAudio, 0.90);
  return threshold(source.aiGeneratedImage, 0.90);
}

function deepfakeThresholdFor(mediaType, thresholds) {
  const source = thresholds || {};
  return mediaType === 'video'
    ? threshold(source.deepfakeVideo, 0.50)
    : threshold(source.deepfakeImage, 0.90);
}

function isDevelopingMediaType(mediaType) {
  return mediaType === 'audio' || mediaType === 'video';
}

function developingMediaLabel(mediaType) {
  return mediaType === 'audio' ? 'Audio' : 'Video';
}

function sourceLabel(value) {
  const words = clean(value).replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.map(function (word) {
    const lower = word.toLowerCase();
    if (lower === 'ai') return 'AI';
    if (lower === 'gpt') return 'GPT';
    if (lower === 'dalle' || lower === 'dall·e' || lower === 'dall-e') return 'DALL-E';
    if (lower === 'sdxl') return 'SDXL';
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function confidenceBandForEvidence(input) {
  const data = input || {};
  if (data.provenanceAffirmative) return 'Very high';
  if (data.mixedProviderEvidence) return 'Mixed';
  if (data.providerConsensusAi) {
    return numeric(data.detectorAiConfidence) != null && data.detectorAiConfidence >= 0.95 ? 'Very high' : 'High';
  }
  if (data.corroboratedAi || data.singleProviderAi) return 'High';
  if (data.providerCompleted) return 'Mixed';
  return 'Undetermined';
}

function providerPublicRecord(provider) {
  return Object.freeze({
    name: provider.provider || '',
    configured: provider.configured === true,
    attempted: provider.attempted === true,
    status: provider.status || 'NOT_CONFIGURED',
    frameCount: Number(provider.frameCount) || 0,
    aiGeneratedScore: numeric(provider.aiGeneratedScore),
    deepfakeScore: numeric(provider.deepfakeScore),
    sourceClass: provider.sourceClass || '',
    sourceScore: numeric(provider.sourceScore),
    charge: provider.charge || null,
    error: provider.error || ''
  });
}

function score(input) {
  const data = input && typeof input === 'object' ? input : {};
  const mediaType = clean(data.mediaType);
  const provenance = data.provenance || {};
  const thresholds = data.thresholds || {};
  const suppliedProviders = Array.isArray(data.providers) ? data.providers : (data.provider ? [data.provider] : []);
  const providers = suppliedProviders.filter(function (entry) { return entry && typeof entry === 'object'; });
  const completedProviders = providers.filter(function (entry) {
    return entry.status === 'COMPLETED' && entry.contentAnalyzed === true;
  });
  const failedProviders = providers.filter(function (entry) { return entry.status === 'FAILED'; });
  const aiScores = completedProviders.map(function (entry) { return entry.aiGeneratedScore; }).map(numeric).filter(function (value) { return value != null; });
  const deepfakeScores = completedProviders.map(function (entry) { return entry.deepfakeScore; }).map(numeric).filter(function (value) { return value != null; });
  const publicAiThreshold = threshold(thresholds.publicAiGenerated, 0.80);
  const strongSingleThreshold = Math.max(publicAiThreshold, aiThresholdFor(mediaType, thresholds));
  const corroborationFloor = Math.min(publicAiThreshold, 0.60);
  const conflictFloor = 0.50;
  const conflictSpread = 0.45;
  const deepfakeThreshold = deepfakeThresholdFor(mediaType, thresholds);
  const provenanceAffirmative = provenance.status === 'AI_DISCLOSURE_FOUND' || provenance.status === 'AI_TOOL_METADATA_FOUND';
  const detectorAiConfidence = average(aiScores);
  const combinedAiConfidence = provenanceAffirmative ? 1 : detectorAiConfidence;
  const highestAiScore = maximum(aiScores);
  const lowestAiScore = minimum(aiScores);
  const detectorSpread = highestAiScore != null && lowestAiScore != null ? highestAiScore - lowestAiScore : null;
  const combinedDeepfakeConfidence = average(deepfakeScores);
  const providerCompleted = completedProviders.length > 0;
  const developingMediaType = isDevelopingMediaType(mediaType);
  const providerConsensusAi = aiScores.length > 1 && aiScores.every(function (value) { return value >= publicAiThreshold; });
  const corroboratedAi = aiScores.length > 1 && highestAiScore != null && lowestAiScore != null &&
    highestAiScore >= strongSingleThreshold && lowestAiScore >= corroborationFloor && detectorSpread <= 0.35;
  const singleProviderAi = aiScores.length === 1 && aiScores[0] >= strongSingleThreshold;
  const mixedProviderEvidence = aiScores.length > 1 && highestAiScore != null && lowestAiScore != null && (
    detectorSpread >= conflictSpread || (highestAiScore >= publicAiThreshold && lowestAiScore < conflictFloor)
  );
  const detectorAiGenerated = !mixedProviderEvidence && (providerConsensusAi || corroboratedAi || singleProviderAi);
  const aiGenerated = provenanceAffirmative || detectorAiGenerated;
  const deepfakeFlagged = combinedDeepfakeConfidence != null && combinedDeepfakeConfidence >= deepfakeThreshold;

  let bestSource = { sourceClass: '', sourceScore: null };
  completedProviders.forEach(function (provider) {
    const value = numeric(provider.sourceScore);
    if (value != null && value >= 0.80 && (bestSource.sourceScore == null || value > bestSource.sourceScore)) {
      bestSource = { sourceClass: provider.sourceClass || '', sourceScore: value };
    }
  });

  const publicSignals = [];
  if (provenanceAffirmative) publicSignals.push('Embedded creation information identified AI generation.');
  if (!provenanceAffirmative && providerConsensusAi) publicSignals.push('Multiple independent detection methods independently reached AIVerify’s AI-generated threshold.');
  if (!provenanceAffirmative && corroboratedAi && !providerConsensusAi) publicSignals.push('One independent method found strong AI evidence and another provided supporting evidence.');
  if (!provenanceAffirmative && singleProviderAi) publicSignals.push('One independent detection method found strong AI-generation evidence.');
  if (deepfakeFlagged) publicSignals.push('Independent analysis identified material AI alteration.');
  if (mixedProviderEvidence) publicSignals.push('Independent detection methods produced materially conflicting results.');
  if (!aiGenerated && !deepfakeFlagged && providerCompleted && !mixedProviderEvidence) {
    if (developingMediaType) {
      publicSignals.push(developingMediaLabel(mediaType) + ' checking is still being developed for this initial release.');
    } else {
      publicSignals.push('The available checks did not find enough evidence for an AI-generated classification.');
    }
  }

  let status = 'INCONCLUSIVE';
  let answer = 'Unclear';
  let explanation = 'The available evidence was not sufficient for a dependable conclusion.';
  let resultLevel = 'warning';

  if (aiGenerated && deepfakeFlagged) {
    status = 'AI_GENERATED_OR_ALTERED';
    answer = 'AI-generated or altered';
    explanation = provenanceAffirmative
      ? 'Embedded creation information identified AI use, and independent analysis also found evidence of material AI alteration.'
      : 'Independent detection methods identified this media as AI-generated or materially altered using AI.';
    resultLevel = 'success';
  } else if (aiGenerated) {
    status = 'AI_GENERATED';
    answer = 'AI-generated';
    if (provenanceAffirmative && detectorAiGenerated) {
      explanation = 'Embedded creation information identifies this media as AI-generated, and independent analysis also supports that conclusion.';
    } else if (provenanceAffirmative) {
      explanation = 'Embedded creation information identifies this media as AI-generated.';
    } else if (providerConsensusAi) {
      explanation = 'Multiple independent detection methods each identified this media as AI-generated.';
    } else if (corroboratedAi) {
      explanation = 'One independent method found strong AI-generation evidence and another provided supporting evidence.';
    } else {
      explanation = 'An independent detection method found strong evidence that this media is AI-generated.';
    }
    resultLevel = 'success';
  } else if (deepfakeFlagged) {
    status = 'AI_ALTERED';
    answer = 'AI-altered';
    explanation = 'Independent analysis identified strong evidence that this media was materially altered using AI.';
    resultLevel = 'success';
  } else if (mixedProviderEvidence) {
    status = 'UNCLEAR';
    answer = 'Unclear';
    explanation = 'The available detection methods materially disagreed, so AIVerify is not classifying this media as AI-generated or human-created.';
  } else if (providerCompleted && developingMediaType) {
    status = 'UNCLEAR';
    answer = 'Unclear';
    explanation = developingMediaLabel(mediaType) + ' checking is still being developed for this initial release. The available analysis did not find strong AI evidence, but AIVerify is not classifying this media as human-created.';
  } else if (providerCompleted) {
    status = 'NO_CLEAR_AI_EVIDENCE';
    answer = 'No clear evidence of AI generation';
    explanation = 'The available checks did not find enough evidence to classify this media as AI-generated. This does not prove it is human-created or unaltered.';
  } else if (failedProviders.length) {
    status = 'ANALYSIS_UNAVAILABLE';
    answer = 'AI analysis unavailable';
    explanation = 'The external analysis could not be completed. Embedded creation information was also not sufficient for a conclusion.';
    resultLevel = 'error';
  }

  const publicSummary = Object.freeze({
    conclusion: answer,
    confidenceBand: confidenceBandForEvidence({
      provenanceAffirmative: provenanceAffirmative,
      mixedProviderEvidence: mixedProviderEvidence,
      providerConsensusAi: providerConsensusAi,
      corroboratedAi: corroboratedAi,
      singleProviderAi: singleProviderAi,
      providerCompleted: providerCompleted,
      detectorAiConfidence: detectorAiConfidence
    }),
    independentChecksCompleted: completedProviders.length,
    provenanceFound: provenanceAffirmative,
    possibleGenerator: bestSource.sourceClass ? sourceLabel(bestSource.sourceClass) : '',
    providerDetailsHidden: true,
    percentageDetailsHidden: true,
    aiGeneratedThresholdApplied: publicAiThreshold
  });

  const attemptedProviders = providers.filter(function (entry) { return entry.attempted === true; });
  const configuredProviders = providers.filter(function (entry) { return entry.configured === true; });
  const providerNames = unique(attemptedProviders.map(function (entry) { return entry.provider; }));
  const aggregateStatus = providerCompleted ? 'COMPLETED' : (failedProviders.length ? 'FAILED' : 'NOT_CONFIGURED');
  const internalProviders = providers.map(providerPublicRecord);

  return Object.freeze({
    version: MODULE_VERSION,
    status: status,
    answer: answer,
    explanation: explanation,
    resultLevel: resultLevel,
    publicSignals: Object.freeze(unique(publicSignals).slice(0, 8)),
    publicSummary: publicSummary,
    metadataOnly: !providerCompleted,
    visualOrAudioContentAnalyzed: providerCompleted,
    internal: Object.freeze({
      detectorAiConfidence: detectorAiConfidence,
      combinedAiConfidence: combinedAiConfidence,
      combinedDeepfakeConfidence: combinedDeepfakeConfidence,
      detectorSpread: detectorSpread,
      providerConsensusAi: providerConsensusAi,
      corroboratedAi: corroboratedAi,
      singleProviderAi: singleProviderAi,
      mixedProviderEvidence: mixedProviderEvidence,
      developingMediaTypeGuardApplied: developingMediaType && !aiGenerated && !deepfakeFlagged,
      thresholds: Object.freeze({
        publicAiThreshold: publicAiThreshold,
        strongSingleThreshold: strongSingleThreshold,
        corroborationFloor: corroborationFloor,
        conflictFloor: conflictFloor,
        conflictSpread: conflictSpread,
        deepfakeThreshold: deepfakeThreshold
      }),
      providers: Object.freeze(internalProviders),
      provider: Object.freeze({
        name: providerNames.join(' + '),
        configured: configuredProviders.length > 0,
        attempted: attemptedProviders.length > 0,
        status: aggregateStatus,
        frameCount: completedProviders.reduce(function (total, entry) { return total + (Number(entry.frameCount) || 0); }, 0),
        aiGeneratedScore: combinedAiConfidence,
        deepfakeScore: combinedDeepfakeConfidence,
        sourceClass: bestSource.sourceClass,
        sourceScore: bestSource.sourceScore,
        charge: null,
        error: failedProviders.length && !providerCompleted
          ? failedProviders.map(function (entry) { return entry.error; }).filter(Boolean).join('; ')
          : ''
      })
    })
  });
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  score: score
});
