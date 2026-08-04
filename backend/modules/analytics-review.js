'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const MODULE_VERSION = 'ANALYTICS_REVIEW_FOUNDATION_V11';
const REVIEW_REASONS = Object.freeze([
  'Seems incorrect',
  'Missing important information',
  'Source problem',
  'Confusing or unclear',
  'Other',
  'Needs Improvement',
  'Incorrect'
]);
const FEEDBACK_RATINGS = Object.freeze(['Acceptable', 'Needs Improvement', 'Incorrect']);
const HUMAN_VERDICTS = Object.freeze(['', 'Valid', 'Incorrect', 'Questionable']);
const RETEST_RESULTS = Object.freeze(['', 'Not retested', 'Passed', 'Failed', 'Partial']);
const ISSUE_CATEGORIES = Object.freeze([
  '',
  'Accuracy',
  'Missing information',
  'Source',
  'Clarity',
  'Routing or classification',
  'Failure or timeout',
  'Duplicate',
  'Other'
]);

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function text(value) {
  return String(value == null ? '' : value);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number >= 0 ? number : fallback;
}

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000000) / 1000000 : null;
}

function clone(value) {
  if (!value || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
}

function validDate(value) {
  return Number.isFinite(Date.parse(value || ''));
}

function safeIso(value) {
  return validDate(value) ? new Date(value).toISOString() : '';
}

function timestampMilliseconds(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeFilenameText(value) {
  return clean(value).replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

function domainFromUrl(value) {
  try { return new URL(String(value || '')).hostname.replace(/^www\./i, '').toLowerCase(); }
  catch (_error) { return ''; }
}

function eventId() {
  return Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeDuplicateText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/https?:\/\/[^\s]+/g, function (url) {
      try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
      } catch (_error) {
        return url;
      }
    })
    .replace(/\b(?:please|could you|would you|can you|tell me|show me|help me|i want to know|i would like to know)\b/g, ' ')
    .replace(/[^\p{L}\p{N}:/._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeDuplicateText(value).split(/\s+/).filter(Boolean));
}

function jaccard(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach(function (token) { if (right.has(token)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

function bigrams(value) {
  const normalized = normalizeDuplicateText(value).replace(/\s+/g, ' ');
  const result = [];
  for (let index = 0; index < normalized.length - 1; index += 1) result.push(normalized.slice(index, index + 2));
  return result;
}

function dice(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  left.forEach(function (item) { counts.set(item, (counts.get(item) || 0) + 1); });
  let matches = 0;
  right.forEach(function (item) {
    const count = counts.get(item) || 0;
    if (count > 0) {
      matches += 1;
      counts.set(item, count - 1);
    }
  });
  return (2 * matches) / (left.length + right.length);
}

function overlapCoefficient(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach(function (token) { if (right.has(token)) intersection += 1; });
  return intersection / Math.min(left.size, right.size);
}

function nearDuplicateScore(a, b) {
  const left = normalizeDuplicateText(a);
  const right = normalizeDuplicateText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const tokenScore = jaccard(left, right);
  const characterScore = dice(left, right);
  const containmentScore = Math.min(leftTokens.size, rightTokens.size) >= 4
    ? overlapCoefficient(left, right) * 0.94
    : 0;
  return Math.max(tokenScore, characterScore * 0.96, containmentScore);
}


function isNonQualifyingOutcome(event) {
  const outcomeValue = clean(event && event.outcome || '').toUpperCase();
  return outcomeValue === 'CLARIFICATION_REQUIRED' || outcomeValue === 'INVALID_INPUT' || outcomeValue === 'INVALID_REQUEST';
}

function isMediaReviewEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  return !!clean(source.mediaSha256 || source.mediaFilename || '') || /^AI media detection scan:/i.test(clean(source.inputExact || ''));
}

function mediaFilenameFromEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  const explicit = safeFilenameText(source.mediaFilename || '');
  if (explicit) return explicit;
  const match = text(source.inputExact || '').match(/^AI media detection scan:\s*(.+)$/i);
  return match ? safeFilenameText(match[1]) : '';
}

function canonicalLegacyMediaFilename(eventOrFilename) {
  const raw = typeof eventOrFilename === 'string'
    ? safeFilenameText(eventOrFilename)
    : mediaFilenameFromEvent(eventOrFilename);
  if (!raw) return '';
  let filename = path.basename(raw).normalize('NFKC').toLocaleLowerCase('en-US').trim();
  const dotIndex = filename.lastIndexOf('.');
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  let stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  stem = stem
    .replace(/\s*\(\d+\)\s*$/g, '')
    .replace(/\s*-\s*copy(?:\s*\(\d+\))?\s*$/g, '')
    .replace(/\s+copy(?:\s*\(\d+\))?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stem ? stem + extension : '';
}

function mediaShaGroupKey(event) {
  const value = clean(event && event.mediaSha256 || '').toLocaleLowerCase('en-US');
  return value ? 'sha256:' + value : '';
}

function legacyMediaFilenameGroupKey(eventOrFilename) {
  const value = canonicalLegacyMediaFilename(eventOrFilename);
  return value ? 'filename:' + value : '';
}

function eventVisibleResult(event) {
  const source = event && typeof event === 'object' ? event : {};
  return text(source.frontendVisibleResultExact || source.userVisibleResultExact || source.resultTextExact || '');
}

function resultFingerprint(event) {
  const normalized = clean(eventVisibleResult(event)).toLocaleLowerCase('en-US');
  return normalized ? hash(normalized) : '';
}

function eventAutomaticReasons(event) {
  const source = event && typeof event === 'object' ? event : {};
  const reasons = uniqueFlags([].concat(source.qualityFlags || [], source.failureCategory || []));
  if (!reasons.length && (source.automaticFlag || source.reviewRequired)) reasons.push('REVIEW_SUGGESTED');
  return reasons;
}

function latestByTimestamp(values) {
  return (Array.isArray(values) ? values : []).reduce(function (latest, value) {
    if (!latest || String(value.timestamp || '') > String(latest.timestamp || '')) return value;
    return latest;
  }, null);
}

function groupReviewEvents(sourceEvents) {
  const sorted = (Array.isArray(sourceEvents) ? sourceEvents : []).slice().sort(function (a, b) {
    return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  });
  const groups = [];
  const exactInputGroups = new Map();
  const exactMediaShaGroups = new Map();
  const legacyMediaFilenameGroups = new Map();

  sorted.forEach(function (event) {
    if (!event || typeof event !== 'object') return;
    const normalized = clean(event.inputNormalized || normalizeDuplicateText(event.inputExact || ''));
    const inputHash = clean(event.inputHash || (normalized ? hash(normalized) : ''));
    const mediaEvent = isMediaReviewEvent(event);
    const mediaShaKey = mediaShaGroupKey(event);
    const legacyMediaKey = legacyMediaFilenameGroupKey(event);
    let group = mediaShaKey ? exactMediaShaGroups.get(mediaShaKey) : null;
    if (!group && legacyMediaKey) group = legacyMediaFilenameGroups.get(legacyMediaKey) || null;
    if (!group && inputHash && (!mediaEvent || legacyMediaKey)) group = exactInputGroups.get(inputHash) || null;

    if (!group && normalized && !isMediaReviewEvent(event) && normalized.length >= 12) {
      for (let index = groups.length - 1, checked = 0; index >= 0 && checked < 400; index -= 1, checked += 1) {
        const candidate = groups[index];
        if (candidate.mediaOnly) continue;
        const score = nearDuplicateScore(normalized, candidate.matchInput);
        if (score >= 0.82) {
          group = candidate;
          break;
        }
      }
    }

    if (!group) {
      group = {
        groupId: clean(event.eventId) || eventId(),
        matchInput: normalized,
        mediaOnly: mediaEvent,
        attempts: []
      };
      groups.push(group);
    }
    group.attempts.push(event);
    if (inputHash && (!mediaEvent || legacyMediaKey)) exactInputGroups.set(inputHash, group);
    if (mediaShaKey) exactMediaShaGroups.set(mediaShaKey, group);
    if (legacyMediaKey) legacyMediaFilenameGroups.set(legacyMediaKey, group);
  });

  return groups.map(function (group) {
    const attempts = group.attempts.slice().sort(function (a, b) { return String(a.timestamp || '').localeCompare(String(b.timestamp || '')); });
    const unreviewedAttempts = attempts.filter(function (event) { return !(event.review && event.review.reviewed); });
    const activeAttempts = unreviewedAttempts.length ? unreviewedAttempts : attempts;
    const userFlagLatestByTester = new Map();
    const feedbackLatestByTester = new Map();
    activeAttempts.forEach(function (event) {
      if (event.testerFeedback && FEEDBACK_RATINGS.includes(clean(event.testerFeedback.rating))) {
        const testerKey = clean(event.testerId || event.testerName || 'unknown');
        const existing = feedbackLatestByTester.get(testerKey);
        const feedbackTime = clean(event.testerFeedback.submittedAt || event.timestamp || '');
        const existingTime = existing ? clean(existing.testerFeedback.submittedAt || existing.timestamp || '') : '';
        if (!existing || feedbackTime >= existingTime) feedbackLatestByTester.set(testerKey, event);
      }
      if (!(event.userFlag && event.userFlag.flagged)) return;
      const testerKey = clean(event.testerId || event.testerName || 'unknown');
      const existing = userFlagLatestByTester.get(testerKey);
      const flagTime = clean(event.userFlag.flaggedAt || event.timestamp || '');
      const existingTime = existing ? clean(existing.userFlag.flaggedAt || existing.timestamp || '') : '';
      if (!existing || flagTime >= existingTime) userFlagLatestByTester.set(testerKey, event);
    });
    const userFlagEvents = Array.from(userFlagLatestByTester.values()).sort(function (a, b) {
      return String(b.userFlag && b.userFlag.flaggedAt || b.timestamp || '').localeCompare(String(a.userFlag && a.userFlag.flaggedAt || a.timestamp || ''));
    });
    const automaticEvents = activeAttempts.filter(function (event) {
      return eventAutomaticReasons(event).length > 0;
    });
    const fingerprints = Array.from(new Set(activeAttempts.map(resultFingerprint).filter(Boolean)));
    const aggregateReasons = uniqueFlags(automaticEvents.reduce(function (all, event) {
      return all.concat(eventAutomaticReasons(event));
    }, []));
    if (fingerprints.length > 1) aggregateReasons.unshift('REPEATED_SCAN_RESULT_CHANGED');
    const representative = latestByTimestamp(userFlagEvents) || latestByTimestamp(automaticEvents) || latestByTimestamp(activeAttempts) || latestByTimestamp(attempts) || attempts[0];
    const firstSeenAt = attempts[0] && attempts[0].timestamp || '';
    const lastSeenAt = attempts[attempts.length - 1] && attempts[attempts.length - 1].timestamp || firstSeenAt;
    const pendingSinceAt = (unreviewedAttempts[0] && unreviewedAttempts[0].timestamp) || lastSeenAt;
    const testerFeedbacks = Array.from(feedbackLatestByTester.values()).sort(function (a, b) {
      return String(b.testerFeedback && b.testerFeedback.submittedAt || b.timestamp || '').localeCompare(String(a.testerFeedback && a.testerFeedback.submittedAt || a.timestamp || ''));
    }).map(function (event) {
      return {
        testerId: clean(event.testerId || ''),
        testerName: clean(event.testerName || 'Unknown tester'),
        rating: clean(event.testerFeedback && event.testerFeedback.rating || ''),
        comment: text(event.testerFeedback && event.testerFeedback.comment || '').slice(0, 4000),
        submittedAt: safeIso(event.testerFeedback && event.testerFeedback.submittedAt || event.timestamp)
      };
    });
    const userFlags = userFlagEvents.map(function (event) {
      return {
        testerId: clean(event.testerId || ''),
        testerName: clean(event.testerName || 'Unknown tester'),
        reason: clean(event.userFlag && event.userFlag.reason || ''),
        otherText: text(event.userFlag && event.userFlag.otherText || '').slice(0, 4000),
        flaggedAt: safeIso(event.userFlag && event.userFlag.flaggedAt || event.timestamp),
        fromFeedback: event.userFlag && event.userFlag.fromFeedback === true
      };
    });
    const copy = clone(representative) || {};
    copy.reviewGroupId = group.groupId;
    copy.reviewEventIds = attempts.map(function (event) { return event.eventId; }).filter(Boolean);
    copy.attemptCount = attempts.length;
    copy.unreviewedAttemptCount = unreviewedAttempts.length;
    copy.firstSeenAt = firstSeenAt;
    copy.lastSeenAt = lastSeenAt;
    copy.pendingSinceAt = pendingSinceAt;
    copy.displayTimestamp = representative && representative.timestamp || pendingSinceAt;
    copy.resultVariantCount = fingerprints.length;
    copy.testerFeedbacks = testerFeedbacks;
    copy.testerFeedback = testerFeedbacks.length ? {
      rating: testerFeedbacks[0].rating,
      comment: testerFeedbacks[0].comment,
      submittedAt: testerFeedbacks[0].submittedAt
    } : normalizeTesterFeedback(null);
    copy.userFlags = userFlags;
    copy.userFlag = userFlags.length ? {
      flagged: true,
      reason: userFlags[0].reason,
      otherText: userFlags[0].otherText,
      flaggedAt: userFlags[0].flaggedAt,
      fromFeedback: userFlags[0].fromFeedback === true
    } : { flagged: false, reason: '', otherText: '', flaggedAt: '', fromFeedback: false };
    copy.qualityFlags = aggregateReasons;
    copy.failureCategory = aggregateReasons[0] || '';
    copy.automaticFlag = aggregateReasons.length > 0;
    copy.reviewRequired = aggregateReasons.length > 0;
    copy.review = Object.assign({}, copy.review || {}, { reviewed: unreviewedAttempts.length === 0 });
    copy.qualifyingScan = true;
    return copy;
  });
}

function parseContracts(body) {
  const contracts = [];
  String(body || '').split(/\r?\n/).forEach(function (line) {
    const match = line.match(/^AIV_RESULT_CONTRACT:\s*(\{.*\})\s*$/);
    if (!match) return;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object') contracts.push(parsed);
    } catch (_error) {}
  });
  return contracts;
}

function headerRoute(body) {
  const match = String(body || '').match(/(?:^|\|)\s*route=([^|\r\n]+)/i);
  return clean(match && match[1] || '');
}

function inputType(input, optionType) {
  if (clean(optionType)) return clean(optionType);
  const source = clean(input);
  const urls = source.match(/https?:\/\/[^\s]+/gi) || [];
  if (urls.length) {
    if (urls.some(function (url) { return /(?:youtube\.com|youtu\.be)/i.test(url); })) return 'VIDEO_URL';
    return urls.length > 1 ? 'MULTI_URL' : 'SPECIFIC_CONTENT_URL';
  }
  if (source.length >= 1200 || source.split(/\s+/).filter(Boolean).length >= 180) return 'DOCUMENT_OR_LONG_TEXT';
  if (/\?$/.test(source) || /^(?:who|what|when|where|why|how|which|is|are|was|were|can|could|do|does|did|should|would|has|have)\b/i.test(source)) return 'QUESTION';
  return 'CLAIM_OR_STATEMENT';
}

function expectedEntityQuestion(input) {
  const question = clean(input).toLowerCase();
  return /^(?:who|where|which|what)\b/.test(question) && !/^(?:what|which)\s+(?:is|are|was|were|does|do|did|can|could|should|would|has|have)\b/.test(question);
}

function canonicalFlag(value) {
  const flag = clean(value).toUpperCase();
  if (flag === 'SOURCE_METADATA_IN_COUNTRY_ANSWER' || flag === 'SOURCE_METADATA_IN_ENTITY_ANSWER') return 'SOURCE_METADATA_IN_ENTITY_ANSWER';
  return flag;
}

function uniqueFlags(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(canonicalFlag).filter(Boolean)));
}

function qualityFlags(input, contract, answer) {
  const flags = [];
  const question = clean(input).toLowerCase();
  const directAnswer = clean(answer);
  const explanation = clean(contract && (contract.explanation || contract.why || contract.additionalInformation || contract.details) || '');
  if (!directAnswer) flags.push('EMPTY_DIRECT_ANSWER');
  if (/\b(?:EXPLANATION|SOURCE)\s*:/i.test(directAnswer)) flags.push('SERIALIZED_SECTION_IN_ANSWER');
  if (expectedEntityQuestion(input) && /^(?:yes|no)(?:\b|[\s—–\-:;,])/i.test(directAnswer)) flags.push('ENTITY_QUESTION_RENDERED_AS_YES_NO');
  if (/\b(?:what|which)\s+country\b/.test(question) && /^(?:wikipedia|openai model knowledge|established references|reference sources reviewed|https?:\/\/|www\.)/i.test(directAnswer)) flags.push('SOURCE_METADATA_IN_ENTITY_ANSWER');
  if (expectedEntityQuestion(input) && /^(?:wikipedia|openai model knowledge|established references|reference sources reviewed|source|sources)$/i.test(directAnswer)) flags.push('SOURCE_METADATA_IN_ENTITY_ANSWER');
  if (directAnswer && explanation) {
    const normalize = function (value) { return clean(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); };
    const answerNormalized = normalize(directAnswer);
    const explanationNormalized = normalize(explanation);
    if (answerNormalized.length >= 35 && explanationNormalized.length >= 35 && (explanationNormalized.startsWith(answerNormalized) || answerNormalized.startsWith(explanationNormalized))) flags.push('ANSWER_EXPLANATION_DUPLICATION');
  }
  return uniqueFlags(flags);
}

function outcome(body, contracts, errorType, aborted) {
  const raw = String(body || '');
  const lower = raw.toLowerCase();
  if (/CLARIFICATION_REQUIRED:\s*true/i.test(raw)) return { outcome: 'CLARIFICATION_REQUIRED', failureCategory: '' };
  if (/REQUEST_TYPE:\s*INVALID_INPUT/i.test(raw)) return { outcome: 'INVALID_INPUT', failureCategory: '' };
  if (/REQUEST_TYPE:\s*INVALID_REQUEST/i.test(raw)) return { outcome: 'INVALID_REQUEST', failureCategory: '' };
  if (aborted) return { outcome: 'ABORTED', failureCategory: 'CLIENT_ABORTED' };
  if (clean(errorType)) return { outcome: 'ERROR', failureCategory: clean(errorType).slice(0, 120) || 'BACKEND_ERROR' };
  if (/timed?\s*out|timeout/.test(lower)) return { outcome: 'TIMEOUT', failureCategory: 'TIMEOUT' };
  if (/select analyze\/enter again to retry|please try again/.test(lower)) return { outcome: 'RETRY', failureCategory: 'RETRY_REQUIRED' };
  if (/not included in the current aiverify release|currently being updated to support this type of scan/.test(lower)) return { outcome: 'EARLY_RELEASE_LIMITATION', failureCategory: 'EARLY_RELEASE_LIMITATION' };
  if (!contracts.length) return { outcome: 'INVALID_RESPONSE', failureCategory: 'MISSING_RESULT_CONTRACT' };
  if (contracts.some(function (contract) { return contract && contract.contractValidated === false; })) return { outcome: 'VALIDATION_FAILURE', failureCategory: 'CONTRACT_VALIDATION_FAILURE' };
  return { outcome: 'ANSWERED', failureCategory: '' };
}

function sourceTier(contract, route) {
  const value = contract && typeof contract === 'object' ? contract : {};
  const source = clean(value.source || value.sourceBasis || '');
  const url = clean(value.sourceUrl || value.primarySourceUrl || '');
  const normalizedRoute = clean(route || value.route || '').toLowerCase();
  if (/openai model knowledge/i.test(source)) return 'MODEL_KNOWLEDGE';
  if (/scripture/i.test(source) || /local-kjv|faith\/local|scripture\/local/i.test(normalizedRoute)) return 'LOCAL_SOURCE';
  if (/live|web-search|openai-web|current/i.test(normalizedRoute)) return 'CURRENT_INFORMATION_LOOKUP';
  if (url || source) return 'EXTERNAL_REFERENCE';
  return 'UNSPECIFIED';
}

function visibleResultFromContracts(contracts, body) {
  if (!contracts.length) return String(body || '');
  return contracts.map(function (contract, index) {
    const rows = [];
    if (contracts.length > 1) rows.push('Result ' + (index + 1));
    const answer = clean(contract.answer || contract.analysisResult || contract.status || contract.summary || '');
    const explanation = clean(contract.explanation || contract.why || '');
    const additional = contract.additionalInformation || contract.supportingInformation || contract.details || '';
    const source = clean(contract.source || contract.sourceBasis || '');
    const sourceUrl = clean(contract.sourceUrl || contract.primarySourceUrl || '');
    if (answer) rows.push('Answer: ' + answer);
    if (explanation) rows.push('Explanation: ' + explanation);
    if (Array.isArray(additional)) {
      additional.forEach(function (item) { if (clean(item)) rows.push(clean(item)); });
    } else if (clean(additional)) {
      rows.push('Additional Information: ' + clean(additional));
    }
    if (source) rows.push('Source: ' + source);
    if (sourceUrl) rows.push('Source link: ' + sourceUrl);
    return rows.join('\n');
  }).join('\n\n');
}

function walkCountWebSearchCalls(node, seen) {
  if (!node || typeof node !== 'object') return 0;
  const visited = seen || new Set();
  if (visited.has(node)) return 0;
  visited.add(node);
  if (Array.isArray(node)) return node.reduce(function (total, item) { return total + walkCountWebSearchCalls(item, visited); }, 0);
  let count = clean(node.type).toLowerCase() === 'web_search_call' ? 1 : 0;
  Object.keys(node).forEach(function (key) {
    const value = node[key];
    if (value && typeof value === 'object') count += walkCountWebSearchCalls(value, visited);
  });
  return count;
}

function modelPricing(model, env) {
  const normalized = clean(model).toLowerCase();
  const configuredInput = nonNegativeNumber(env.AIV_OPENAI_INPUT_USD_PER_MILLION, null);
  const configuredCached = nonNegativeNumber(env.AIV_OPENAI_CACHED_INPUT_USD_PER_MILLION, null);
  const configuredOutput = nonNegativeNumber(env.AIV_OPENAI_OUTPUT_USD_PER_MILLION, null);
  if (configuredInput != null && configuredOutput != null) {
    return { input: configuredInput, cached: configuredCached == null ? configuredInput : configuredCached, output: configuredOutput, source: 'environment' };
  }
  if (/^gpt-5\.4-mini(?:-|$)/.test(normalized)) return { input: 0.75, cached: 0.075, output: 4.50, source: 'built-in-current-rate' };
  if (/^gpt-4o-mini(?:-|$)/.test(normalized)) return { input: 0.15, cached: 0.075, output: 0.60, source: 'built-in-rate' };
  if (/^gpt-4\.1-mini(?:-|$)/.test(normalized)) return { input: 0.40, cached: 0.10, output: 1.60, source: 'built-in-rate' };
  return null;
}

function parseUsage(json) {
  const usage = json && json.usage && typeof json.usage === 'object' ? json.usage : {};
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object' ? usage.input_tokens_details : {};
  return {
    inputTokens: Math.max(0, Math.round(finiteNumber(usage.input_tokens, 0))),
    cachedInputTokens: Math.max(0, Math.round(finiteNumber(inputDetails.cached_tokens, 0))),
    outputTokens: Math.max(0, Math.round(finiteNumber(usage.output_tokens, 0))),
    totalTokens: Math.max(0, Math.round(finiteNumber(usage.total_tokens, 0)))
  };
}

function estimateOpenAICost(model, usage, webSearchCalls, env) {
  const pricing = modelPricing(model, env);
  const webSearchRate = nonNegativeNumber(env.AIV_OPENAI_WEB_SEARCH_USD_PER_CALL, 0.01);
  if (!pricing) {
    return {
      estimatedCostUsd: webSearchCalls > 0 ? roundMoney(webSearchCalls * webSearchRate) : null,
      costKnown: webSearchCalls > 0,
      pricingSource: webSearchCalls > 0 ? 'web-search-rate-only' : 'unpriced-model'
    };
  }
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncached = Math.max(0, usage.inputTokens - cached);
  const tokenCost = uncached / 1000000 * pricing.input + cached / 1000000 * pricing.cached + usage.outputTokens / 1000000 * pricing.output;
  return {
    estimatedCostUsd: roundMoney(tokenCost + webSearchCalls * webSearchRate),
    costKnown: true,
    pricingSource: pricing.source
  };
}

function parseOperationCount(value, fallback) {
  const match = String(value == null ? '' : value).match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : Number(fallback);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeProviderOperation(operation, env) {
  const source = operation && typeof operation === 'object' ? operation : {};
  const provider = clean(source.provider || 'unknown').toLowerCase();
  const actualRequest = source.actualRequest === true || source.attempted === true;
  let requestCount = Math.max(0, finiteNumber(source.requestCount, actualRequest ? 1 : 0));
  let operations = Math.max(0, finiteNumber(source.operations, requestCount));
  let estimatedCostUsd = source.estimatedCostUsd == null ? null : roundMoney(source.estimatedCostUsd);
  let costKnown = source.costKnown === true || estimatedCostUsd != null;
  let pricingSource = clean(source.pricingSource || '');

  if (provider === 'hive') {
    operations = parseOperationCount(source.operations || source.charge, actualRequest ? 1 : 0);
    const rate = nonNegativeNumber(env.AIV_HIVE_USD_PER_OPERATION, null);
    if (rate != null) {
      estimatedCostUsd = roundMoney(operations * rate);
      costKnown = true;
      pricingSource = 'environment';
    }
  } else if (provider === 'sightengine') {
    operations = parseOperationCount(source.operations || source.charge, actualRequest ? 1 : 0);
    const rate = nonNegativeNumber(env.AIV_SIGHTENGINE_USD_PER_OPERATION, null);
    if (rate != null) {
      estimatedCostUsd = roundMoney(operations * rate);
      costKnown = true;
      pricingSource = 'environment';
    }
  } else if (provider === 'supadata') {
    operations = Math.max(1, parseOperationCount(source.operations || source.billableRequests, requestCount || 1));
    const rate = nonNegativeNumber(env.AIV_SUPADATA_USD_PER_REQUEST, null);
    if (rate != null) {
      estimatedCostUsd = roundMoney(operations * rate);
      costKnown = true;
      pricingSource = 'environment';
    }
  }

  return {
    provider: provider,
    operation: clean(source.operation || 'request'),
    actualRequest: actualRequest,
    requestCount: requestCount,
    operations: operations,
    status: clean(source.status || ''),
    model: clean(source.model || ''),
    taskId: clean(source.taskId || '').slice(0, 180),
    inputTokens: Math.max(0, Math.round(finiteNumber(source.inputTokens, 0))),
    cachedInputTokens: Math.max(0, Math.round(finiteNumber(source.cachedInputTokens, 0))),
    outputTokens: Math.max(0, Math.round(finiteNumber(source.outputTokens, 0))),
    totalTokens: Math.max(0, Math.round(finiteNumber(source.totalTokens,
      finiteNumber(source.inputTokens, 0) + finiteNumber(source.outputTokens, 0)))),
    webSearchCalls: Math.max(0, Math.round(finiteNumber(source.webSearchCalls, 0))),
    estimatedCostUsd: estimatedCostUsd,
    costKnown: costKnown,
    pricingSource: pricingSource,
    error: clean(source.error || '').slice(0, 500),
    cacheDisposition: clean(source.cacheDisposition || '')
  };
}

function defaultReview() {
  return {
    reviewed: false,
    humanVerdict: '',
    issueCategory: '',
    automaticFlagMatched: null,
    notes: '',
    repairVersion: '',
    retestResult: '',
    updatedAt: ''
  };
}

function normalizeReview(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    reviewed: source.reviewed === true,
    humanVerdict: HUMAN_VERDICTS.includes(clean(source.humanVerdict)) ? clean(source.humanVerdict) : '',
    issueCategory: ISSUE_CATEGORIES.includes(clean(source.issueCategory)) ? clean(source.issueCategory) : clean(source.issueCategory).slice(0, 100),
    automaticFlagMatched: source.automaticFlagMatched === true ? true : (source.automaticFlagMatched === false ? false : null),
    notes: text(source.notes).slice(0, 10000),
    repairVersion: clean(source.repairVersion).slice(0, 120),
    retestResult: RETEST_RESULTS.includes(clean(source.retestResult)) ? clean(source.retestResult) : clean(source.retestResult).slice(0, 80),
    updatedAt: safeIso(source.updatedAt)
  };
}

function normalizeTesterFeedback(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rating = FEEDBACK_RATINGS.includes(clean(source.rating)) ? clean(source.rating) : '';
  return {
    rating: rating,
    comment: text(source.comment || '').slice(0, 4000),
    submittedAt: safeIso(source.submittedAt)
  };
}

function normalizeOverallFeedback(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    feedbackId: clean(source.feedbackId) || eventId(),
    testerId: clean(source.testerId),
    testerName: clean(source.testerName || 'Tester').slice(0, 120),
    feedback: text(source.feedback || '').slice(0, 10000),
    submittedAt: safeIso(source.submittedAt) || new Date().toISOString(),
    roundId: clean(source.roundId || 'all'),
    roundLabel: clean(source.roundLabel || '').slice(0, 120)
  };
}

function normalizeEvent(event, backendVersion) {
  const source = event && typeof event === 'object' ? event : {};
  const inputExact = source.inputExact != null ? text(source.inputExact) : text(source.inputPreview || '');
  const resultTextExact = source.resultTextExact != null ? text(source.resultTextExact) : text(source.userVisibleResultExact || source.answerPreview || '');
  const normalized = normalizeDuplicateText(inputExact);
  const quality = uniqueFlags(source.qualityFlags);
  const providerUsage = (Array.isArray(source.providerUsage) ? source.providerUsage : []).map(function (item) { return normalizeProviderOperation(item, process.env); });
  const reviewRequired = source.reviewRequired === true || !!source.failureCategory || quality.length > 0;
  return Object.assign({}, source, {
    eventId: clean(source.eventId) || eventId(),
    timestamp: safeIso(source.timestamp) || new Date().toISOString(),
    backendVersion: clean(source.backendVersion) || backendVersion,
    frontendVersion: clean(source.frontendVersion || ''),
    inputExact: inputExact,
    inputNormalized: normalized,
    inputHash: clean(source.inputHash) || hash(normalized),
    resultTextExact: resultTextExact,
    userVisibleResultExact: text(source.userVisibleResultExact || resultTextExact),
    frontendVisibleResultExact: text(source.frontendVisibleResultExact || ''),
    qualityFlags: quality,
    reviewRequired: reviewRequired,
    automaticFlag: source.automaticFlag === true || reviewRequired,
    userFlag: source.userFlag && typeof source.userFlag === 'object' ? {
      flagged: source.userFlag.flagged === true,
      reason: REVIEW_REASONS.includes(clean(source.userFlag.reason)) ? clean(source.userFlag.reason) : '',
      otherText: text(source.userFlag.otherText || '').slice(0, 4000),
      flaggedAt: safeIso(source.userFlag.flaggedAt),
      fromFeedback: source.userFlag.fromFeedback === true
    } : { flagged: false, reason: '', otherText: '', flaggedAt: '', fromFeedback: false },
    testerFeedback: normalizeTesterFeedback(source.testerFeedback),
    review: normalizeReview(source.review),
    providerUsage: providerUsage,
    duplicateType: clean(source.duplicateType || ''),
    duplicateOfEventId: clean(source.duplicateOfEventId || ''),
    duplicateSimilarity: finiteNumber(source.duplicateSimilarity, 0),
    qualifyingScan: source.qualifyingScan !== false
  });
}

function datePartsInZone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = {};
  parts.forEach(function (part) { if (part.type !== 'literal') map[part.type] = Number(part.value); });
  return { year: map.year, month: map.month, day: map.day };
}

function dateKey(parts) {
  return String(parts.year).padStart(4, '0') + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0');
}

function addMonths(parts, count) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + count, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: parts.day };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampCycleDay(year, month, day) {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

function billingCycle(now, timezone, cycleDay) {
  const current = datePartsInZone(now, timezone);
  let startMonth = { year: current.year, month: current.month, day: 1 };
  const currentStartDay = clampCycleDay(current.year, current.month, cycleDay);
  if (current.day < currentStartDay) startMonth = addMonths(startMonth, -1);
  const start = {
    year: startMonth.year,
    month: startMonth.month,
    day: clampCycleDay(startMonth.year, startMonth.month, cycleDay)
  };
  const nextMonth = addMonths({ year: start.year, month: start.month, day: 1 }, 1);
  const end = {
    year: nextMonth.year,
    month: nextMonth.month,
    day: clampCycleDay(nextMonth.year, nextMonth.month, cycleDay)
  };
  return { startDate: dateKey(start), endDateExclusive: dateKey(end) };
}

function providerTemplate(name) {
  return {
    provider: name,
    requests: 0,
    operations: 0,
    estimatedCostUsd: 0,
    unpricedOperations: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    webSearchCalls: 0
  };
}

function periodTotals(events, allEvents) {
  const providers = {
    openai: providerTemplate('openai'),
    supadata: providerTemplate('supadata'),
    hive: providerTemplate('hive'),
    sightengine: providerTemplate('sightengine')
  };
  const activeTesters = new Set();
  let paidApiScans = 0;
  let currentInformationLookupScans = 0;
  let totalCost = 0;
  let unpricedOperations = 0;

  events.forEach(function (event) {
    if (event.testerId) activeTesters.add(event.testerId);
    if (event.paidApiUse) paidApiScans += 1;
    if (event.currentInformationLookup) currentInformationLookupScans += 1;
    (Array.isArray(event.providerUsage) ? event.providerUsage : []).forEach(function (operation) {
      const provider = providers[operation.provider] || (providers[operation.provider] = providerTemplate(operation.provider));
      if (operation.actualRequest) provider.requests += Math.max(1, Number(operation.requestCount) || 1);
      provider.operations += Number(operation.operations) || 0;
      provider.inputTokens += Number(operation.inputTokens) || 0;
      provider.cachedInputTokens += Number(operation.cachedInputTokens) || 0;
      provider.outputTokens += Number(operation.outputTokens) || 0;
      provider.totalTokens += Number(operation.totalTokens) || 0;
      provider.webSearchCalls += Number(operation.webSearchCalls) || 0;
      if (operation.costKnown && operation.estimatedCostUsd != null) {
        provider.estimatedCostUsd += Number(operation.estimatedCostUsd) || 0;
        totalCost += Number(operation.estimatedCostUsd) || 0;
      } else if (operation.actualRequest) {
        provider.unpricedOperations += Number(operation.operations) || Math.max(1, Number(operation.requestCount) || 1);
        unpricedOperations += Number(operation.operations) || Math.max(1, Number(operation.requestCount) || 1);
      }
    });
  });

  Object.keys(providers).forEach(function (name) {
    providers[name].estimatedCostUsd = roundMoney(providers[name].estimatedCostUsd) || 0;
  });

  const qualifyingEvents = events.filter(function (event) { return !isNonQualifyingOutcome(event); });
  const periodEventIds = new Set(qualifyingEvents.map(function (event) { return event.eventId; }));
  const globalGroups = groupReviewEvents((Array.isArray(allEvents) ? allEvents : events).filter(function (event) { return !isNonQualifyingOutcome(event); }));
  const qualifyingScans = globalGroups.filter(function (group) {
    return Array.isArray(group.reviewEventIds) && group.reviewEventIds.length && periodEventIds.has(group.reviewEventIds[0]);
  }).length;
  const periodGroups = groupReviewEvents(qualifyingEvents);
  const failuresReviewRequiredScans = periodGroups.filter(function (event) {
    return event.reviewRequired || event.userFlag && event.userFlag.flagged;
  }).length;

  return {
    scans: events.length,
    qualifyingScans: qualifyingScans,
    duplicateOrNearDuplicateScans: Math.max(0, qualifyingEvents.length - qualifyingScans),
    paidApiScans: paidApiScans,
    currentInformationLookupScans: currentInformationLookupScans,
    failuresOrReviewRequiredScans: failuresReviewRequiredScans,
    activeTesters: activeTesters.size,
    providers: providers,
    totalApiCostUsd: roundMoney(totalCost) || 0,
    averageCostPerScanUsd: events.length ? roundMoney(totalCost / events.length) || 0 : 0,
    unpricedOperations: unpricedOperations,
    costCoverageComplete: unpricedOperations === 0
  };
}

function createAnalyticsReviewFoundation(options) {
  const settings = options && typeof options === 'object' ? options : {};
  const env = settings.env && typeof settings.env === 'object' ? settings.env : process.env;
  const backendVersion = clean(settings.backendVersion);
  const backendDir = clean(settings.backendDir) || process.cwd();
  if (!backendVersion) throw new Error('Analytics review foundation requires the active backend version.');

  const storageDir = clean(env.AIV_ANALYTICS_STORAGE_DIR) || path.join(backendDir, 'data', 'analytics');
  const eventFile = path.join(storageDir, 'scan-events.jsonl');
  const overallFeedbackFile = path.join(storageDir, 'overall-feedback.jsonl');
  const reviewRoundFile = path.join(storageDir, 'review-round.json');
  const secretFile = path.join(storageDir, '.analytics-secret');
  const timezone = clean(env.AIV_ANALYTICS_TIMEZONE) || 'America/New_York';
  const billingCycleDay = Math.min(28, Math.max(1, Math.round(finiteNumber(env.AIV_ANALYTICS_BILLING_CYCLE_DAY, 1))));
  const memoryLimit = Math.max(100, Math.min(25000, Math.round(finiteNumber(env.AIV_ANALYTICS_MEMORY_LIMIT, 5000))));
  const retentionDays = Math.max(30, Math.min(3650, Math.round(finiteNumber(env.AIV_ANALYTICS_RETENTION_DAYS, 730))));
  const events = [];
  const overallFeedbacks = [];
  let reviewRounds = [];
  let currentReviewRound = { id: 'all', number: 0, label: 'All stored scans', startedAt: '' };
  const contextStorage = new AsyncLocalStorage();
  let hashSecret = '';
  let storageReady = false;
  let warningEmitted = false;
  const startedAt = new Date().toISOString();

  function warn(error) {
    if (warningEmitted) return;
    warningEmitted = true;
    console.warn('AIV analytics review storage warning: ' + clean(error && error.message || error));
  }



  function normalizeReviewRound(value, fallbackNumber) {
    const source = value && typeof value === 'object' ? value : {};
    const number = Math.max(0, Math.round(finiteNumber(source.number, fallbackNumber || 0)));
    return {
      id: clean(source.id) || (number > 0 ? ('legacy-round-' + number) : 'all'),
      number: number,
      label: clean(source.label) || (number > 0 ? ('Test Round ' + number) : 'All stored scans'),
      startedAt: safeIso(source.startedAt)
    };
  }

  function reviewRoundSort(left, right) {
    const leftNumber = Math.max(0, Math.round(finiteNumber(left && left.number, 0)));
    const rightNumber = Math.max(0, Math.round(finiteNumber(right && right.number, 0)));
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return timestampMilliseconds(left && left.startedAt) - timestampMilliseconds(right && right.startedAt);
  }

  function addOrReplaceReviewRound(round) {
    const normalized = normalizeReviewRound(round);
    const existingIndex = reviewRounds.findIndex(function (item) {
      return clean(item.id) === clean(normalized.id) || (normalized.number > 0 && Number(item.number) === Number(normalized.number));
    });
    if (existingIndex >= 0) reviewRounds[existingIndex] = normalized;
    else reviewRounds.push(normalized);
    reviewRounds.sort(reviewRoundSort);
    return normalized;
  }

  function ensureReviewRoundHistory() {
    const current = normalizeReviewRound(currentReviewRound);
    if (current.number > 0) {
      for (let number = 1; number < current.number; number += 1) {
        if (!reviewRounds.some(function (item) { return Number(item.number) === number; })) {
          addOrReplaceReviewRound({ id: 'legacy-round-' + number, number: number, label: 'Test Round ' + number, startedAt: '' });
        }
      }
    }
    overallFeedbacks.forEach(function (item) {
      const itemNumberMatch = clean(item.roundLabel).match(/(?:test\s*)?round\s*(\d+)/i);
      const itemNumber = itemNumberMatch ? Number(itemNumberMatch[1]) : 0;
      if (!clean(item.roundId) && !itemNumber) return;
      addOrReplaceReviewRound({
        id: clean(item.roundId) || ('legacy-round-' + itemNumber),
        number: itemNumber,
        label: clean(item.roundLabel) || (itemNumber ? ('Test Round ' + itemNumber) : 'Previous round'),
        startedAt: ''
      });
    });
    addOrReplaceReviewRound(current);
    currentReviewRound = reviewRounds.find(function (item) { return clean(item.id) === clean(current.id); }) || current;
  }

  function reviewRoundWindow(round) {
    const selected = normalizeReviewRound(round);
    if (!selected || clean(selected.id) === 'all') return { start: 0, end: Number.POSITIVE_INFINITY };
    const ordered = reviewRounds.slice().sort(reviewRoundSort);
    const index = ordered.findIndex(function (item) { return clean(item.id) === clean(selected.id); });
    const start = timestampMilliseconds(selected.startedAt);
    let end = Number.POSITIVE_INFINITY;
    for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
      const nextStart = timestampMilliseconds(ordered[cursor] && ordered[cursor].startedAt);
      if (nextStart > start) { end = nextStart; break; }
    }
    return { start: start, end: end };
  }

  function resolveReviewRound(roundId) {
    const requested = clean(roundId);
    if (requested === 'all') return { id: 'all', number: 0, label: 'All Test Rounds', startedAt: '' };
    if (requested && requested !== 'current') {
      const match = reviewRounds.find(function (item) { return clean(item.id) === requested; });
      if (match) return clone(match);
    }
    return clone(currentReviewRound);
  }

  function publicReviewRounds() {
    return reviewRounds.slice().sort(reviewRoundSort).map(function (item) { return clone(item); });
  }

  function writeOverallFeedbacks() {
    if (!storageReady) return false;
    try {
      const temporary = overallFeedbackFile + '.tmp';
      fs.writeFileSync(temporary, overallFeedbacks.map(function (item) { return JSON.stringify(item); }).join('\n') + (overallFeedbacks.length ? '\n' : ''), 'utf8');
      try { fs.rmSync(overallFeedbackFile, { force: true }); } catch (_error) {}
      fs.renameSync(temporary, overallFeedbackFile);
      return true;
    } catch (error) {
      warn(error);
      return false;
    }
  }

  function writeReviewRound() {
    if (!storageReady) return false;
    try {
      const payload = {
        currentRoundId: clean(currentReviewRound.id),
        rounds: publicReviewRounds()
      };
      fs.writeFileSync(reviewRoundFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      return true;
    } catch (error) {
      warn(error);
      return false;
    }
  }

  function rewriteEvents() {
    if (!storageReady) return false;
    try {
      const temporary = eventFile + '.tmp';
      fs.writeFileSync(temporary, events.map(function (event) { return JSON.stringify(event); }).join('\n') + (events.length ? '\n' : ''), 'utf8');
      try { fs.rmSync(eventFile, { force: true }); } catch (_error) {}
      fs.renameSync(temporary, eventFile);
      return true;
    } catch (error) {
      warn(error);
      return false;
    }
  }

  function appendEvent(event) {
    if (!storageReady) return;
    fs.appendFile(eventFile, JSON.stringify(event) + '\n', function (error) { if (error) warn(error); });
  }

  function initialize() {
    try {
      fs.mkdirSync(storageDir, { recursive: true });
      const configuredSecret = clean(env.AIV_ANALYTICS_HASH_SECRET || '');
      if (configuredSecret) hashSecret = configuredSecret;
      else if (fs.existsSync(secretFile)) hashSecret = clean(fs.readFileSync(secretFile, 'utf8'));
      if (!hashSecret) {
        hashSecret = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(secretFile, hashSecret, { encoding: 'utf8', mode: 0o600 });
      }
      if (fs.existsSync(eventFile)) {
        const cutoff = Date.now() - retentionDays * 86400000;
        String(fs.readFileSync(eventFile, 'utf8') || '').split(/\r?\n/).forEach(function (line) {
          if (!line.trim()) return;
          try {
            const parsed = normalizeEvent(JSON.parse(line), backendVersion);
            if (Date.parse(parsed.timestamp) >= cutoff) events.push(parsed);
          } catch (_error) {}
        });
      }
      if (fs.existsSync(overallFeedbackFile)) {
        String(fs.readFileSync(overallFeedbackFile, 'utf8') || '').split(/\r?\n/).forEach(function (line) {
          if (!line.trim()) return;
          try { overallFeedbacks.push(normalizeOverallFeedback(JSON.parse(line))); } catch (_error) {}
        });
      }
      if (fs.existsSync(reviewRoundFile)) {
        try {
          const storedRoundState = JSON.parse(fs.readFileSync(reviewRoundFile, 'utf8'));
          if (storedRoundState && typeof storedRoundState === 'object' && Array.isArray(storedRoundState.rounds)) {
            reviewRounds = storedRoundState.rounds.map(function (item, index) { return normalizeReviewRound(item, index + 1); });
            const currentRoundId = clean(storedRoundState.currentRoundId);
            currentReviewRound = reviewRounds.find(function (item) { return clean(item.id) === currentRoundId; }) || reviewRounds[reviewRounds.length - 1] || currentReviewRound;
          } else if (storedRoundState && typeof storedRoundState === 'object') {
            currentReviewRound = normalizeReviewRound(storedRoundState);
            reviewRounds = [clone(currentReviewRound)];
          }
        } catch (_error) {}
      }
      ensureReviewRoundHistory();
      dedupeOverallFeedbacks();
      while (events.length > memoryLimit) events.shift();
      storageReady = true;
      rewriteEvents();
      writeOverallFeedbacks();
      writeReviewRound();
    } catch (error) {
      hashSecret = hashSecret || crypto.randomBytes(32).toString('hex');
      storageReady = false;
      warn(error);
    }
  }

  function activeContext() {
    return contextStorage.getStore() || null;
  }

  function runScan(context, work) {
    const source = context && typeof context === 'object' ? context : {};
    const store = {
      startedAt: Date.now(),
      frontendVersion: clean(source.frontendVersion || ''),
      testerId: clean(source.testerId || ''),
      testerName: clean(source.testerName || ''),
      providerUsage: [],
      requestKind: clean(source.requestKind || 'scan')
    };
    return contextStorage.run(store, work);
  }

  function recordProviderOperation(operation) {
    const store = activeContext();
    if (!store) return null;
    const normalized = normalizeProviderOperation(operation, env);
    store.providerUsage.push(normalized);
    return normalized;
  }

  function recordProviderOperations(operations) {
    (Array.isArray(operations) ? operations : []).forEach(recordProviderOperation);
  }

  function recordOpenAIResponse(payload, response, metadata) {
    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const result = response && typeof response === 'object' ? response : {};
    const json = result.json && typeof result.json === 'object' ? result.json : {};
    const model = clean(payload && payload.model || json.model || '');
    const usage = parseUsage(json);
    const webSearchCalls = walkCountWebSearchCalls(json);
    const estimate = estimateOpenAICost(model, usage, webSearchCalls, env);
    return recordProviderOperation({
      provider: 'openai',
      operation: 'responses',
      actualRequest: meta.actualRequest !== false,
      requestCount: meta.actualRequest === false ? 0 : 1,
      operations: meta.actualRequest === false ? 0 : 1,
      status: result.ok ? 'COMPLETED' : (clean(result.errorType || result.statusCode || 'FAILED')),
      model: model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      webSearchCalls: webSearchCalls,
      estimatedCostUsd: meta.actualRequest === false ? 0 : estimate.estimatedCostUsd,
      costKnown: meta.actualRequest === false ? true : estimate.costKnown,
      pricingSource: meta.actualRequest === false ? 'no-provider-request' : estimate.pricingSource,
      error: result.ok ? '' : clean(result.errorType || ''),
      cacheDisposition: clean(meta.cacheDisposition || '')
    });
  }

  function recordOpenAICache(payload, cacheDisposition) {
    return recordProviderOperation({
      provider: 'openai',
      operation: 'responses',
      actualRequest: false,
      requestCount: 0,
      operations: 0,
      status: 'REUSED',
      model: clean(payload && payload.model || ''),
      estimatedCostUsd: 0,
      costKnown: true,
      pricingSource: 'no-provider-request',
      cacheDisposition: clean(cacheDisposition || 'cache-hit')
    });
  }

  function recordExternalProviderRequest(provider, details) {
    const data = details && typeof details === 'object' ? details : {};
    return recordProviderOperation({
      provider: provider,
      operation: clean(data.operation || 'request'),
      actualRequest: true,
      requestCount: 1,
      operations: data.operations || data.billableRequests || 1,
      status: clean(data.status || ''),
      taskId: clean(data.taskId || ''),
      error: clean(data.error || '')
    });
  }

  function visitorId(req) {
    const forwarded = clean(req && req.headers && req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || clean(req && req.headers && req.headers['cf-connecting-ip'] || '') || clean(req && req.socket && req.socket.remoteAddress || '');
    const agent = clean(req && req.headers && req.headers['user-agent'] || '');
    if (!ip && !agent) return '';
    const month = new Date().toISOString().slice(0, 7);
    return crypto.createHmac('sha256', hashSecret).update(month + '|' + ip + '|' + agent).digest('hex').slice(0, 18);
  }

  function findDuplicate(inputExact, testerId, mediaSha256, mediaFilename) {
    const normalized = normalizeDuplicateText(inputExact);
    const inputHash = hash(normalized);
    const mediaEvent = /^AI media detection scan:/i.test(clean(inputExact || '')) || !!clean(mediaSha256 || mediaFilename || '');
    const mediaShaKey = clean(mediaSha256 || '').toLocaleLowerCase('en-US');
    const legacyMediaKey = legacyMediaFilenameGroupKey({ mediaFilename: mediaFilename, inputExact: inputExact });
    const candidates = events.slice().reverse().filter(function (event) {
      return !testerId || event.testerId === testerId;
    }).slice(0, 400);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (mediaShaKey && clean(candidate.mediaSha256 || '').toLocaleLowerCase('en-US') === mediaShaKey) {
        return { type: 'EXACT_MEDIA', eventId: candidate.eventId, similarity: 1 };
      }
      if (legacyMediaKey && legacyMediaFilenameGroupKey(candidate) === legacyMediaKey) {
        return { type: 'EXACT_MEDIA_LEGACY_NAME', eventId: candidate.eventId, similarity: 1 };
      }
      if (!mediaEvent && normalized && inputHash === candidate.inputHash) {
        return { type: 'EXACT_INPUT', eventId: candidate.eventId, similarity: 1 };
      }
    }
    if (mediaEvent || normalized.length < 12) return null;
    let best = null;
    candidates.forEach(function (candidate) {
      if (!candidate.inputExact || isMediaReviewEvent(candidate)) return;
      const score = nearDuplicateScore(normalized, candidate.inputExact);
      if (score >= 0.82 && (!best || score > best.similarity)) best = { type: 'NEAR_DUPLICATE', eventId: candidate.eventId, similarity: score };
    });
    return best;
  }

  function recordScanEvent(details) {
    try {
      const data = details && typeof details === 'object' ? details : {};
      const store = activeContext() || { providerUsage: [] };
      const body = text(data.body || '');
      const contracts = Array.isArray(data.contracts) ? data.contracts : parseContracts(body);
      const primary = contracts[0] || (data.contract && typeof data.contract === 'object' ? data.contract : {});
      const resultOutcome = outcome(body, contracts.length ? contracts : (primary && Object.keys(primary).length ? [primary] : []), data.errorType, data.aborted);
      const route = clean(primary.route || headerRoute(body) || data.route || '');
      const directAnswer = clean(primary.answer || primary.summary || primary.why || data.answer || '');
      const flags = resultOutcome.outcome === 'ANSWERED' ? qualityFlags(data.input, primary, directAnswer) : [];
      const reviewRequired = !!resultOutcome.failureCategory || flags.length > 0;
      const duplicate = findDuplicate(data.input, clean(data.testerId || store.testerId), clean(data.mediaSha256 || ''), clean(data.mediaFilename || ''));
      const providerUsage = (Array.isArray(store.providerUsage) ? store.providerUsage : []).map(function (item) { return normalizeProviderOperation(item, env); });
      const paidApiUse = providerUsage.some(function (item) { return item.actualRequest && ['openai', 'supadata', 'hive', 'sightengine'].includes(item.provider); });
      const currentInformationLookup = providerUsage.some(function (item) { return item.webSearchCalls > 0; }) || /live|web-search|openai-web|current/i.test(route) || sourceTier(primary, route) === 'CURRENT_INFORMATION_LOOKUP';
      const source = clean(primary.source || primary.sourceBasis || data.source || '');
      const sourceUrl = clean(primary.sourceUrl || primary.primarySourceUrl || data.sourceUrl || '');
      const timestamp = new Date().toISOString();
      const inputExact = text(data.input || '');
      const normalizedInput = normalizeDuplicateText(inputExact);
      const event = normalizeEvent({
        eventId: eventId(),
        timestamp: timestamp,
        backendVersion: backendVersion,
        frontendVersion: clean(data.frontendVersion || store.frontendVersion || ''),
        requestId: clean(data.requestId || data.req && data.req.headers && data.req.headers['rndr-id'] || '').slice(0, 100),
        anonymousVisitorId: visitorId(data.req),
        testerId: clean(data.testerId || store.testerId || '').slice(0, 64),
        testerName: clean(data.testerName || store.testerName || '').slice(0, 80),
        inputType: inputType(inputExact, data.inputType),
        inputExact: inputExact,
        inputNormalized: normalizedInput,
        inputHash: hash(normalizedInput),
        inputCharacters: inputExact.length,
        inputWords: clean(inputExact).split(/\s+/).filter(Boolean).length,
        mediaSha256: clean(data.mediaSha256 || ''),
        mediaFilename: safeFilenameText(data.mediaFilename || ''),
        resultTextExact: body,
        userVisibleResultExact: text(data.userVisibleResultExact || visibleResultFromContracts(contracts.length ? contracts : (primary && Object.keys(primary).length ? [primary] : []), body)),
        frontendVisibleResultExact: '',
        resultContracts: clone(contracts.length ? contracts : (primary && Object.keys(primary).length ? [primary] : [])),
        outcome: reviewRequired && resultOutcome.outcome === 'ANSWERED' ? 'ANSWERED_REVIEW_REQUIRED' : resultOutcome.outcome,
        failureCategory: flags[0] || resultOutcome.failureCategory || '',
        reviewRequired: reviewRequired,
        automaticFlag: reviewRequired,
        qualityFlags: flags,
        durationMs: Math.max(0, Math.round(finiteNumber(data.durationMs, Date.now() - (store.startedAt || Date.now())))),
        route: route,
        classification: clean(primary.classification || data.classification || '').slice(0, 240),
        analysisResult: clean(primary.analysisResult || primary.status || data.analysisResult || '').slice(0, 240),
        answerExact: directAnswer,
        source: source,
        sourceUrl: sourceUrl,
        sourceUrlHost: domainFromUrl(sourceUrl),
        sourceTier: sourceTier(primary, route),
        contractCount: contracts.length || (primary && Object.keys(primary).length ? 1 : 0),
        contractValidated: primary.contractValidated !== false,
        providerUsage: providerUsage,
        paidApiUse: paidApiUse,
        currentInformationLookup: currentInformationLookup,
        clientTimezone: clean(data.clientTimezone || '').slice(0, 100),
        clientDate: clean(data.clientDate || '').slice(0, 40),
        duplicateType: duplicate ? duplicate.type : '',
        duplicateOfEventId: duplicate ? duplicate.eventId : '',
        duplicateSimilarity: duplicate ? roundMoney(duplicate.similarity) : 0,
        qualifyingScan: !duplicate && !['CLARIFICATION_REQUIRED', 'INVALID_INPUT', 'INVALID_REQUEST'].includes(resultOutcome.outcome),
        userFlag: { flagged: false, reason: '', otherText: '', flaggedAt: '', fromFeedback: false },
        testerFeedback: normalizeTesterFeedback(null),
        review: defaultReview()
      }, backendVersion);

      events.push(event);
      while (events.length > memoryLimit) events.shift();
      appendEvent(event);
      return clone(event);
    } catch (error) {
      warn(error);
      return null;
    }
  }

  function findEvent(eventIdentifier) {
    const identifier = clean(eventIdentifier);
    return events.find(function (event) { return event.eventId === identifier; }) || null;
  }

  function updateVisibleResult(details) {
    const data = details && typeof details === 'object' ? details : {};
    const event = findEvent(data.eventId);
    if (!event) return { ok: false, status: 404, error: 'Scan record not found.' };
    if (!data.testerId || event.testerId !== data.testerId) return { ok: false, status: 403, error: 'Forbidden' };
    event.frontendVisibleResultExact = text(data.visibleResult || '').slice(0, 1000000);
    if (clean(data.frontendVersion)) event.frontendVersion = clean(data.frontendVersion).slice(0, 100);
    rewriteEvents();
    return { ok: true, eventId: event.eventId };
  }

  function flagEvent(details) {
    const data = details && typeof details === 'object' ? details : {};
    const event = findEvent(data.eventId);
    const reason = clean(data.reason);
    const otherText = text(data.otherText || '').slice(0, 1000);
    if (!event) return { ok: false, status: 404, error: 'Scan record not found.' };
    if (!data.testerId || event.testerId !== data.testerId) return { ok: false, status: 403, error: 'Forbidden' };
    if (data.flagged === false) {
      event.userFlag = { flagged: false, reason: '', otherText: '', flaggedAt: '' };
      rewriteEvents();
      return { ok: true, eventId: event.eventId, flagged: false };
    }
    if (reason && !REVIEW_REASONS.includes(reason)) return { ok: false, status: 400, error: 'Choose a valid review reason.' };
    event.userFlag = { flagged: true, reason: reason, otherText: reason === 'Other' ? otherText : '', flaggedAt: new Date().toISOString() };
    rewriteEvents();
    return { ok: true, eventId: event.eventId, flagged: true, reason: reason, otherText: event.userFlag.otherText };
  }

  function feedbackEvent(details) {
    const data = details && typeof details === 'object' ? details : {};
    const event = findEvent(data.eventId);
    const rating = clean(data.rating);
    const comment = text(data.comment || '').slice(0, 4000);
    if (!event) return { ok: false, status: 404, error: 'Scan record not found.' };
    if (!data.testerId || event.testerId !== data.testerId) return { ok: false, status: 403, error: 'Forbidden' };
    if (!FEEDBACK_RATINGS.includes(rating)) return { ok: false, status: 400, error: 'Choose Acceptable, Needs Improvement, or Incorrect.' };
    const submittedAt = new Date().toISOString();
    event.testerFeedback = { rating: rating, comment: comment, submittedAt: submittedAt };
    if (rating === 'Acceptable') {
      event.userFlag = { flagged: false, reason: '', otherText: '', flaggedAt: '', fromFeedback: false };
    } else {
      event.userFlag = { flagged: true, reason: rating, otherText: comment, flaggedAt: submittedAt, fromFeedback: true };
    }
    rewriteEvents();
    return { ok: true, eventId: event.eventId, feedback: clone(event.testerFeedback), flagged: event.userFlag.flagged };
  }


  function feedbackBelongsToRound(item, round) {
    const selected = round && typeof round === 'object' ? round : resolveReviewRound(round);
    if (!selected) return false;
    if (clean(selected.id) === 'all') return true;
    if (clean(item && item.roundId) === clean(selected.id)) return true;
    const selectedNumber = Math.max(0, Math.round(finiteNumber(selected.number, 0)));
    const labelMatch = clean(item && item.roundLabel).match(/(?:test\s*)?round\s*(\d+)/i);
    return selectedNumber > 0 && labelMatch && Number(labelMatch[1]) === selectedNumber;
  }

  function dedupeOverallFeedbacks() {
    if (overallFeedbacks.length < 2) return false;
    const newestByTesterRound = new Map();
    overallFeedbacks.forEach(function (item, index) {
      const testerKey = clean(item && item.testerId).toLowerCase();
      const roundKey = clean(item && item.roundId) || clean(item && item.roundLabel).toLowerCase() || 'all';
      const key = testerKey + '|' + roundKey;
      const existing = newestByTesterRound.get(key);
      if (!existing || String(item && item.submittedAt || '').localeCompare(String(existing.item && existing.item.submittedAt || '')) >= 0) {
        newestByTesterRound.set(key, { item: item, index: index });
      }
    });
    const keep = new Set(Array.from(newestByTesterRound.values()).map(function (entry) { return entry.index; }));
    if (keep.size === overallFeedbacks.length) return false;
    const deduped = overallFeedbacks.filter(function (_item, index) { return keep.has(index); });
    overallFeedbacks.splice.apply(overallFeedbacks, [0, overallFeedbacks.length].concat(deduped));
    return true;
  }

  function saveOverallFeedback(details) {
    const data = details && typeof details === 'object' ? details : {};
    const testerId = clean(data.testerId);
    const feedback = text(data.feedback || '').trim().slice(0, 10000);
    if (!testerId) return { ok: false, status: 403, error: 'Forbidden' };
    if (!feedback) return { ok: false, status: 400, error: 'Enter feedback or a suggestion before saving.' };
    const roundId = clean(currentReviewRound.id || 'all');
    const submittedAt = new Date().toISOString();
    const matchingIndexes = [];
    overallFeedbacks.forEach(function (item, index) {
      if (clean(item && item.testerId).toLowerCase() === testerId.toLowerCase() && feedbackBelongsToRound(item, currentReviewRound)) matchingIndexes.push(index);
    });
    const previous = matchingIndexes.length ? overallFeedbacks[matchingIndexes[matchingIndexes.length - 1]] : null;
    const saved = normalizeOverallFeedback({
      feedbackId: previous && previous.feedbackId,
      testerId: testerId,
      testerName: data.testerName || previous && previous.testerName || 'Tester',
      feedback: feedback,
      submittedAt: submittedAt,
      roundId: roundId,
      roundLabel: clean(currentReviewRound.label || 'Current test round')
    });
    for (let index = matchingIndexes.length - 1; index >= 0; index -= 1) overallFeedbacks.splice(matchingIndexes[index], 1);
    overallFeedbacks.push(saved);
    writeOverallFeedbacks();
    return { ok: true, updated: matchingIndexes.length > 0, feedback: clone(saved), round: clone(currentReviewRound) };
  }

  function startReviewRound(details) {
    const data = details && typeof details === 'object' ? details : {};
    ensureReviewRoundHistory();
    const highestNumber = reviewRounds.reduce(function (highest, item) { return Math.max(highest, Math.round(finiteNumber(item.number, 0))); }, 0);
    const nextNumber = Math.max(1, highestNumber + 1);
    const startedAt = new Date().toISOString();
    currentReviewRound = addOrReplaceReviewRound({
      id: 'round-' + nextNumber + '-' + Date.now().toString(36),
      number: nextNumber,
      label: clean(data.label) || ('Test Round ' + nextNumber),
      startedAt: startedAt
    });
    writeReviewRound();
    return { ok: true, round: clone(currentReviewRound), rounds: publicReviewRounds() };
  }

  function feedbackForRound(selectedRound) {
    const round = selectedRound && typeof selectedRound === 'object' ? selectedRound : resolveReviewRound(selectedRound);
    if (!round || clean(round.id) === 'all') return clone(overallFeedbacks).sort(function (a, b) { return String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')); });
    const selectedNumber = Math.max(0, Math.round(finiteNumber(round.number, 0)));
    return clone(overallFeedbacks.filter(function (item) {
      if (clean(item.roundId) === clean(round.id)) return true;
      const labelMatch = clean(item.roundLabel).match(/(?:test\s*)?round\s*(\d+)/i);
      return selectedNumber > 0 && labelMatch && Number(labelMatch[1]) === selectedNumber;
    })).sort(function (a, b) { return String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')); });
  }

  function updateReview(details) {
    const data = details && typeof details === 'object' ? details : {};
    const identifiers = Array.from(new Set([].concat(Array.isArray(data.eventIds) ? data.eventIds : [], data.eventId || []).map(clean).filter(Boolean)));
    const matching = events.filter(function (event) { return identifiers.includes(event.eventId); });
    if (!matching.length) return { ok: false, status: 404, error: 'Scan record not found.' };
    const incoming = data.review && typeof data.review === 'object' ? data.review : data;
    const updatedAt = new Date().toISOString();
    matching.forEach(function (event) {
      event.review = normalizeReview(Object.assign({}, event.review || {}, incoming, { updatedAt: updatedAt }));
    });
    rewriteEvents();
    return { ok: true, eventId: matching[0].eventId, eventIds: matching.map(function (event) { return event.eventId; }), review: clone(matching[0].review) };
  }

  function eventDateKey(event) {
    return dateKey(datePartsInZone(new Date(event.timestamp), timezone));
  }

  function testerUsageSummary(testerAccounts) {
    const map = new Map();
    (Array.isArray(testerAccounts) ? testerAccounts : []).forEach(function (account) {
      map.set(account.id, {
        testerId: account.id,
        testerName: account.name,
        totalScans: 0,
        qualifyingScans: 0,
        duplicateScans: 0,
        paidApiScans: 0,
        failuresOrReviewScans: 0,
        firstScanAt: '',
        lastScanAt: ''
      });
    });
    events.forEach(function (event) {
      if (!event.testerId) return;
      let row = map.get(event.testerId);
      if (!row) {
        row = { testerId: event.testerId, testerName: event.testerName || 'Unknown tester', totalScans: 0, qualifyingScans: 0, duplicateScans: 0, paidApiScans: 0, failuresOrReviewScans: 0, firstScanAt: '', lastScanAt: '' };
        map.set(event.testerId, row);
      }
      row.totalScans += 1;
      if (event.qualifyingScan === false) row.duplicateScans += 1;
      else row.qualifyingScans += 1;
      if (event.paidApiUse) row.paidApiScans += 1;
      if (event.failureCategory || event.reviewRequired || event.userFlag && event.userFlag.flagged) row.failuresOrReviewScans += 1;
      if (!row.firstScanAt || event.timestamp < row.firstScanAt) row.firstScanAt = event.timestamp;
      if (!row.lastScanAt || event.timestamp > row.lastScanAt) row.lastScanAt = event.timestamp;
    });
    return Array.from(map.values()).sort(function (a, b) { return b.totalScans - a.totalScans || a.testerName.localeCompare(b.testerName); });
  }

  function summary(options) {
    const summaryOptions = options && typeof options === 'object' ? options : {};
    const now = new Date();
    const todayDate = dateKey(datePartsInZone(now, timezone));
    const cycle = billingCycle(now, timezone, billingCycleDay);
    const todayEvents = events.filter(function (event) { return eventDateKey(event) === todayDate; });
    const cycleEvents = events.filter(function (event) {
      const key = eventDateKey(event);
      return key >= cycle.startDate && key < cycle.endDateExclusive;
    });
    const firstEventAt = events.length ? events.reduce(function (earliest, event) { return !earliest || event.timestamp < earliest ? event.timestamp : earliest; }, '') : startedAt;
    return {
      ok: true,
      version: backendVersion,
      analyticsVersion: MODULE_VERSION,
      timezone: timezone,
      trackingStartedAt: firstEventAt,
      generatedAt: now.toISOString(),
      periods: {
        today: Object.assign({ label: 'Today', startDate: todayDate, endDateInclusive: todayDate }, periodTotals(todayEvents, events)),
        billingCycle: Object.assign({ label: 'Current provider billing cycle', startDate: cycle.startDate, endDateExclusive: cycle.endDateExclusive }, periodTotals(cycleEvents, events)),
        grandTotal: Object.assign({ label: 'Grand total since tracking began', startDate: firstEventAt.slice(0, 10), endDateInclusive: todayDate }, periodTotals(events, events))
      },
      registeredTesters: Array.isArray(summaryOptions.testerAccounts) ? summaryOptions.testerAccounts.length : 0,
      testerUsage: testerUsageSummary(summaryOptions.testerAccounts),
      storage: health().storage
    };
  }

  function queue(options) {
    const query = options && typeof options === 'object' ? options : {};
    const limit = Math.max(1, Math.min(500, Math.round(finiteNumber(query.limit, 200))));
    const includeReviewed = query.includeReviewed !== false;
    const qualifyingOnly = query.qualifyingOnly === true;
    const includeArchived = query.includeArchived === true;
    const order = clean(query.order).toLowerCase() === 'newest' ? 'newest' : 'oldest';
    const requestedFilter = clean(query.filter).toLowerCase();
    const filter = ['unreviewed', 'reviewed', 'user-flagged', 'automatic-flags', 'acceptable', 'needs-improvement', 'incorrect', 'all'].indexOf(requestedFilter) >= 0
      ? requestedFilter
      : (includeReviewed ? 'all' : 'unreviewed');
    ensureReviewRoundHistory();
    const selectedRound = includeArchived ? resolveReviewRound('all') : resolveReviewRound(query.roundId || 'current');
    const selectedWindow = reviewRoundWindow(selectedRound);
    const eligibleEvents = events.filter(function (event) {
      if (qualifyingOnly && isNonQualifyingOutcome(event)) return false;
      const eventTime = timestampMilliseconds(event.timestamp);
      return eventTime >= selectedWindow.start && eventTime < selectedWindow.end;
    });
    const grouped = groupReviewEvents(eligibleEvents);
    const counts = {
      total: grouped.length,
      unreviewed: grouped.filter(function (event) { return !(event.review && event.review.reviewed); }).length,
      reviewed: grouped.filter(function (event) { return event.review && event.review.reviewed; }).length,
      userFlagged: grouped.filter(function (event) { return event.userFlag && event.userFlag.flagged; }).length,
      automaticallyFlagged: grouped.filter(function (event) { return event.automaticFlag || event.reviewRequired || event.failureCategory; }).length,
      acceptable: grouped.filter(function (event) { return (event.testerFeedbacks || []).some(function (feedback) { return feedback.rating === 'Acceptable'; }); }).length,
      needsImprovement: grouped.filter(function (event) { return (event.testerFeedbacks || []).some(function (feedback) { return feedback.rating === 'Needs Improvement'; }); }).length,
      incorrect: grouped.filter(function (event) { return (event.testerFeedbacks || []).some(function (feedback) { return feedback.rating === 'Incorrect'; }); }).length,
      rawAttempts: eligibleEvents.length,
      repeatedAttempts: Math.max(0, eligibleEvents.length - grouped.length),
      archived: 0,
      overallFeedback: feedbackForRound(selectedRound).length
    };
    let source = grouped.filter(function (event) {
      const reviewed = !!(event.review && event.review.reviewed);
      const userFlagged = !!(event.userFlag && event.userFlag.flagged);
      const automaticallyFlagged = !!(event.automaticFlag || event.reviewRequired || event.failureCategory);
      if (filter === 'unreviewed') return !reviewed;
      if (filter === 'reviewed') return reviewed;
      if (filter === 'user-flagged') return userFlagged;
      if (filter === 'automatic-flags') return automaticallyFlagged;
      const feedbacks = Array.isArray(event.testerFeedbacks) ? event.testerFeedbacks : [];
      if (filter === 'acceptable') return feedbacks.some(function (feedback) { return feedback.rating === 'Acceptable'; });
      if (filter === 'needs-improvement') return feedbacks.some(function (feedback) { return feedback.rating === 'Needs Improvement'; });
      if (filter === 'incorrect') return feedbacks.some(function (feedback) { return feedback.rating === 'Incorrect'; });
      return true;
    });
    source.sort(function (a, b) {
      const left = timestampMilliseconds(a.displayTimestamp || a.timestamp || a.pendingSinceAt || a.firstSeenAt);
      const right = timestampMilliseconds(b.displayTimestamp || b.timestamp || b.pendingSinceAt || b.firstSeenAt);
      if (left !== right) return order === 'newest' ? right - left : left - right;
      const leftId = clean(a.reviewGroupId || a.eventId || '');
      const rightId = clean(b.reviewGroupId || b.eventId || '');
      return order === 'newest' ? rightId.localeCompare(leftId) : leftId.localeCompare(rightId);
    });
    const selected = source.slice(0, limit).map(function (event) {
      const copy = clone(event);
      copy.reviewOrder = order;
      return copy;
    });
    return {
      ok: true,
      version: backendVersion,
      analyticsVersion: MODULE_VERSION,
      count: selected.length,
      counts: counts,
      filter: filter,
      order: order,
      round: clone(selectedRound),
      selectedRound: clone(selectedRound),
      currentRound: clone(currentReviewRound),
      rounds: publicReviewRounds(),
      includeArchived: includeArchived,
      overallFeedbacks: feedbackForRound(selectedRound),
      events: selected
    };
  }

  function recent(options) {
    const query = options && typeof options === 'object' ? options : {};
    const limit = Math.max(1, Math.min(500, Math.round(finiteNumber(query.limit, 100))));
    let source = events.slice().reverse();
    if (clean(query.outcome)) source = source.filter(function (event) { return event.outcome === clean(query.outcome).toUpperCase(); });
    if (query.reviewOnly) source = source.filter(function (event) { return event.reviewRequired || event.userFlag && event.userFlag.flagged; });
    return { ok: true, version: backendVersion, count: Math.min(limit, source.length), events: clone(source.slice(0, limit)) };
  }

  function exportData(options) {
    const exportOptions = options && typeof options === 'object' ? options : {};
    return {
      ok: true,
      version: backendVersion,
      analyticsVersion: MODULE_VERSION,
      exportedAt: new Date().toISOString(),
      summary: summary(exportOptions),
      reviewQueue: queue({ limit: 500, includeReviewed: true, includeArchived: true }),
      currentReviewRound: clone(currentReviewRound),
      reviewRounds: publicReviewRounds(),
      overallFeedbacks: clone(overallFeedbacks),
      events: clone(events)
    };
  }

  function health() {
    return {
      version: MODULE_VERSION,
      startedAt: startedAt,
      eventCount: events.length,
      reviewQueueCount: groupReviewEvents(events.filter(function (event) { return !isNonQualifyingOutcome(event); })).filter(function (event) { return !(event.review && event.review.reviewed); }).length,
      userFlaggedCount: groupReviewEvents(events.filter(function (event) { return !isNonQualifyingOutcome(event); })).filter(function (event) { return event.userFlag && event.userFlag.flagged; }).length,
      automaticFlaggedCount: groupReviewEvents(events.filter(function (event) { return !isNonQualifyingOutcome(event); })).filter(function (event) { return event.automaticFlag; }).length,
      storage: {
        ready: storageReady,
        directoryConfigured: !!clean(env.AIV_ANALYTICS_STORAGE_DIR),
        directory: storageDir,
        retentionDays: retentionDays,
        memoryLimit: memoryLimit
      },
      billingCycleDay: billingCycleDay,
      timezone: timezone,
      exactInputStored: true,
      exactBackendResultStored: true,
      frontendVisibleResultCaptureEnabled: true,
      duplicateDetectionEnabled: true,
      uniqueReviewGroupingEnabled: true,
      reviewDateDisplaySupported: true,
      reviewFiltersEnabled: true,
      reviewedStatusReversible: true,
      testerFeedbackRatingsEnabled: true,
      testerFeedbackCommentsEnabled: true,
      overallTesterFeedbackEnabled: true,
      overallTesterFeedbackSinglePerRoundEnabled: true,
      reviewRoundsEnabled: true,
      currentReviewRound: clone(currentReviewRound),
      reviewRounds: publicReviewRounds(),
      roundSelectionEnabled: true,
      providerUsageTrackingEnabled: true
    };
  }

  initialize();

  return Object.freeze({
    version: MODULE_VERSION,
    health: health,
    runScan: runScan,
    recordProviderOperation: recordProviderOperation,
    recordProviderOperations: recordProviderOperations,
    recordOpenAIResponse: recordOpenAIResponse,
    recordOpenAICache: recordOpenAICache,
    recordExternalProviderRequest: recordExternalProviderRequest,
    recordScanEvent: recordScanEvent,
    updateVisibleResult: updateVisibleResult,
    flagEvent: flagEvent,
    feedbackEvent: feedbackEvent,
    saveOverallFeedback: saveOverallFeedback,
    startReviewRound: startReviewRound,
    reviewRounds: publicReviewRounds,
    updateReview: updateReview,
    summary: summary,
    recent: recent,
    queue: queue,
    exportData: exportData,
    findEvent: function (identifier) { return clone(findEvent(identifier)); },
    reviewReasons: REVIEW_REASONS.slice(),
    feedbackRatings: FEEDBACK_RATINGS.slice(),
    humanVerdicts: HUMAN_VERDICTS.slice(),
    issueCategories: ISSUE_CATEGORIES.slice(),
    retestResults: RETEST_RESULTS.slice()
  });
}

module.exports = Object.freeze({
  MODULE_VERSION: MODULE_VERSION,
  REVIEW_REASONS: REVIEW_REASONS,
  FEEDBACK_RATINGS: FEEDBACK_RATINGS,
  HUMAN_VERDICTS: HUMAN_VERDICTS,
  ISSUE_CATEGORIES: ISSUE_CATEGORIES,
  RETEST_RESULTS: RETEST_RESULTS,
  createAnalyticsReviewFoundation: createAnalyticsReviewFoundation
});
