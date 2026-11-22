'use strict';
// Check Video: publisher roles shown to the judge and the reader, and lookalike-domain exclusion.
// Roles are assigned by domain only (never by page content or expected verdict).
//   1 primary/official   government, intergovernmental, space agencies, universities, standards bodies
//   2 fact-check         established independent fact-checkers
//   3 news/reference     established news organizations and reference works
//   4 originator         where the claim itself may come from: satire sites, video/social platforms
//   5 other              everything else (blogs, commercial sites, unknown publishers)
const ROLE = { 1: 'primary/official', 2: 'fact-check', 3: 'news/reference', 4: 'originator of the claim', 5: 'other' };

const MULTI_SUFFIX = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'nhs.uk', 'police.uk', 'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.nz', 'org.nz', 'govt.nz', 'ac.nz', 'co.jp', 'go.jp', 'ac.jp', 'or.jp', 'com.br', 'gov.br', 'gc.ca', 'co.za', 'gov.za', 'ac.za', 'co.in', 'gov.in', 'ac.in', 'nic.in',
  'com.mx', 'gob.mx', 'com.ar', 'gob.ar', 'com.co', 'gov.co', 'com.sg', 'gov.sg', 'edu.sg', 'com.hk', 'gov.hk', 'co.kr', 'go.kr', 'com.cn', 'gov.cn', 'edu.cn',
  'co.il', 'gov.il', 'ac.il', 'com.tr', 'gov.tr', 'com.ph', 'gov.ph', 'com.my', 'gov.my', 'co.id', 'go.id', 'com.pk', 'gov.pk', 'com.ng', 'gov.ng', 'co.ke', 'go.ke']);

function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch (_e) { return ''; } }
function registrable(host) {
  const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join('.') : last2;
}

const FACT_CHECK = new Set(['snopes.com', 'politifact.com', 'factcheck.org', 'fullfact.org', 'leadstories.com', 'checkyourfact.com', 'truthorfiction.com',
  'africacheck.org', 'healthfeedback.org', 'climatefeedback.org', 'sciencefeedback.co', 'mediabiasfactcheck.com', 'hoax-slayer.net', 'factcheck.afp.com',
  'logically.ai', 'misbar.com', 'verafiles.org', 'boomlive.in', 'altnews.in', 'factly.in', 'newsmeter.in', 'teyit.org', 'maldita.es', 'newtral.es', 'correctiv.org',
  'pagellapolitica.it', 'demagog.org.pl', 'chequeado.com', 'aosfatos.org', 'lupa.uol.com.br']);
// Fact-check sections of news organizations (host + path prefix)
const FACT_CHECK_PATHS = [['reuters.com', '/fact-check'], ['apnews.com', '/hub/ap-fact-check'], ['usatoday.com', '/story/news/factcheck'], ['bbc.com', '/news/reality_check'],
  ['bbc.co.uk', '/news/reality_check'], ['washingtonpost.com', '/politics/fact-checker'], ['washingtonpost.com', '/politics/20'], ['factcheck.afp.com', '/'], ['aap.com.au', '/factcheck'],
  ['cnn.com', '/politics/fact-check'], ['nytimes.com', '/spotlight/fact-checks'], ['abc.net.au', '/news/factcheck'], ['channel4.com', '/news/factcheck']];
const NEWS_REFERENCE = new Set(['apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'pbs.org', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'theguardian.com',
  'usatoday.com', 'cnn.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'foxnews.com', 'latimes.com', 'chicagotribune.com', 'bloomberg.com', 'ft.com', 'economist.com',
  'theatlantic.com', 'newyorker.com', 'time.com', 'newsweek.com', 'politico.com', 'axios.com', 'thehill.com', 'cnbc.com', 'forbes.com', 'businessinsider.com', 'aljazeera.com',
  'dw.com', 'france24.com', 'abc.net.au', 'cbc.ca', 'globalnews.ca', 'theglobeandmail.com', 'independent.co.uk', 'telegraph.co.uk', 'thetimes.co.uk', 'sky.com', 'news.sky.com',
  'scientificamerican.com', 'nature.com', 'science.org', 'newscientist.com', 'nationalgeographic.com', 'smithsonianmag.com', 'livescience.com', 'space.com', 'phys.org',
  'sciencedaily.com', 'arstechnica.com', 'wired.com', 'theverge.com', 'statnews.com', 'medpagetoday.com', 'webmd.com', 'mayoclinic.org', 'clevelandclinic.org',
  'hopkinsmedicine.org', 'britannica.com', 'wikipedia.org', 'history.com', 'weather.com', 'poynter.org', 'niemanlab.org', 'christianitytoday.com', 'csmonitor.com',
  'thelancet.com', 'nejm.org', 'bmj.com', 'jamanetwork.com', 'ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'merriam-webster.com', 'oed.com', 'worldhistory.org']);
const PRIMARY_EXTRA = new Set(['who.int', 'un.org', 'europa.eu', 'esa.int', 'nato.int', 'worldbank.org', 'imf.org', 'oecd.org', 'iaea.org', 'wmo.int', 'ipcc.ch',
  'unesco.org', 'unicef.org', 'redcross.org', 'icrc.org', 'iso.org', 'ieee.org', 'iapws.org', 'si.edu', 'loc.gov', 'archives.gov', 'federalreserve.gov', 'royalsociety.org',
  'nationalacademies.org', 'cern.ch', 'jaxa.jp', 'supremecourt.gov', 'congress.gov', 'nobelprize.org', 'parliament.uk', 'nhs.uk', 'canada.ca']);
const ORIGINATOR = new Set(['babylonbee.com', 'theonion.com', 'clickhole.com', 'thebeaverton.com', 'waterfordwhispersnews.com', 'newsthump.com', 'thedailymash.co.uk',
  'reductress.com', 'worldnewsdailyreport.com', 'empirenews.net', 'nationalreport.net', 'thepeoplescube.com', 'duffelblog.com', 'thehardtimes.net', 'huzlers.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'threads.net', 'reddit.com', 'rumble.com', 'bitchute.com', 'odysee.com',
  'truthsocial.com', 'gab.com', 'telegram.org', 't.me', 'vimeo.com', 'dailymotion.com', 'substack.com', 'medium.com', 'quora.com', 'pinterest.com', 'linkedin.com']);
// Brand names whose lookalike domains (e.g. snopes.news, abcnews.com.co) are excluded outright.
const BRANDS = { snopes: 'snopes.com', politifact: 'politifact.com', factcheck: 'factcheck.org', reuters: 'reuters.com', apnews: 'apnews.com', bbc: 'bbc.com', cnn: 'cnn.com',
  nytimes: 'nytimes.com', foxnews: 'foxnews.com', abcnews: 'abcnews.go.com', nbcnews: 'nbcnews.com', cbsnews: 'cbsnews.com', washingtonpost: 'washingtonpost.com',
  usatoday: 'usatoday.com', nasa: 'nasa.gov', who: 'who.int', cdc: 'cdc.gov', npr: 'npr.org', theguardian: 'theguardian.com', fullfact: 'fullfact.org', wikipedia: 'wikipedia.org' };
const BRAND_OK = { bbc: ['bbc.com', 'bbc.co.uk'], abcnews: ['abcnews.go.com', 'abcnews.com'], who: ['who.int'], factcheck: ['factcheck.org', 'factcheck.afp.com'] };

function isLookalike(url) {
  const host = hostOf(url), reg = registrable(host);
  if (!host) return true;
  if (/\.com\.co$/.test(host) && !/\.gov\.co$/.test(host)) return true; // classic news-lookalike pattern (abcnews.com.co)
  const label = reg.split('.')[0];
  if (!Object.prototype.hasOwnProperty.call(BRANDS, label)) return false;
  const allowed = BRAND_OK[label] || [BRANDS[label]];
  return !allowed.some(function (a) { return reg === registrable(a) || host === a || host.endsWith('.' + a); });
}

function roleTier(url) {
  const host = hostOf(url), reg = registrable(host);
  let path = ''; try { path = new URL(url).pathname.toLowerCase(); } catch (_e) {}
  if (!host) return 5;
  if (FACT_CHECK.has(reg) || FACT_CHECK.has(host)) return 2;
  for (const [h, p] of FACT_CHECK_PATHS) if ((host === h || host.endsWith('.' + h)) && path.startsWith(p)) return 2;
  if (ORIGINATOR.has(reg) || ORIGINATOR.has(host)) return 4;
  if (/\.(?:gov|mil)$/.test(host) || /\.gov\.[a-z]{2}$/.test(host) || /\.(?:gc\.ca|gouv\.fr|govt\.nz|go\.jp|gob\.[a-z]{2}|admin\.ch|bund\.de)$/.test(host) || /\.int$/.test(host)) return 1;
  if (/\.edu$/.test(host) || /\.(?:ac|edu)\.[a-z]{2}$/.test(host)) return 1;
  if (PRIMARY_EXTRA.has(reg) || PRIMARY_EXTRA.has(host)) return 1;
  if (NEWS_REFERENCE.has(reg) || NEWS_REFERENCE.has(host)) return 3;
  return 5;
}
function describe(url) {
  const tier = roleTier(url), host = hostOf(url);
  return { tier: tier, role: ROLE[tier], host: host, publisher: registrable(host) };
}
// Cary, November 22, 2026: on POLITICAL claims only, network outlets are used after other reliable sources that carry the
// same evidence (a preference order, not a judgment of the outlet; Bob: each source is still judged on its evidence).
const NETWORKS = ['abcnews.go.com', 'abcnews.com', 'abc.com', 'nbcnews.com', 'nbc.com', 'cbsnews.com', 'cbs.com', 'foxnews.com', 'foxbusiness.com', 'newsmax.com'];
function isNetwork(url) { const host = hostOf(url); return NETWORKS.some(function (n) { return host === n || host.endsWith('.' + n); }); }
module.exports = { ROLE, roleTier, describe, isLookalike, registrable, hostOf, isNetwork, NETWORKS };
