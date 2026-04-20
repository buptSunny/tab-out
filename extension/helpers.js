(function initTabOutHelpers(global) {
  'use strict';

  const DEFAULT_LANDING_PAGE_PATTERNS = [
    {
      hostname: 'mail.google.com',
      test: (pathname, url) => !url.includes('#inbox/') && !url.includes('#sent/') && !url.includes('#search/'),
    },
    { hostname: 'x.com', pathExact: ['/home'] },
    { hostname: 'www.linkedin.com', pathExact: ['/'] },
    { hostname: 'github.com', pathExact: ['/'] },
    { hostname: 'www.youtube.com', pathExact: ['/'] },
  ];

  function filterRealTabs(tabs) {
    return (tabs || []).filter((tab) => {
      const url = tab.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    });
  }

  function matchesPattern(parsed, url, pattern) {
    const hostnameMatch = pattern.hostname
      ? parsed.hostname === pattern.hostname
      : pattern.hostnameEndsWith
        ? parsed.hostname.endsWith(pattern.hostnameEndsWith)
        : false;

    if (!hostnameMatch) return false;
    if (pattern.test) return pattern.test(parsed.pathname, url);
    if (pattern.pathPrefix) return parsed.pathname.startsWith(pattern.pathPrefix);
    if (pattern.pathExact) return pattern.pathExact.includes(parsed.pathname);
    return parsed.pathname === '/';
  }

  function isLandingPage(url, patterns) {
    try {
      const parsed = new URL(url);
      return patterns.some((pattern) => matchesPattern(parsed, url, pattern));
    } catch {
      return false;
    }
  }

  function matchCustomGroup(url, customGroups) {
    try {
      const parsed = new URL(url);
      return customGroups.find((rule) => {
        const hostMatch = rule.hostname
          ? parsed.hostname === rule.hostname
          : rule.hostnameEndsWith
            ? parsed.hostname.endsWith(rule.hostnameEndsWith)
            : false;

        if (!hostMatch) return false;
        if (rule.pathPrefix) return parsed.pathname.startsWith(rule.pathPrefix);
        return true;
      }) || null;
    } catch {
      return null;
    }
  }

  function buildDomainGroups(realTabs, options = {}) {
    const landingPagePatterns = [
      ...DEFAULT_LANDING_PAGE_PATTERNS,
      ...(options.localLandingPagePatterns || []),
    ];
    const customGroups = options.localCustomGroups || [];
    const groupMap = {};
    const landingTabs = [];

    for (const tab of realTabs || []) {
      try {
        if (isLandingPage(tab.url, landingPagePatterns)) {
          landingTabs.push(tab);
          continue;
        }

        const customRule = matchCustomGroup(tab.url, customGroups);
        if (customRule) {
          const key = customRule.groupKey;
          if (!groupMap[key]) {
            groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
          }
          groupMap[key].tabs.push(tab);
          continue;
        }

        const hostname = tab.url && tab.url.startsWith('file://')
          ? 'local-files'
          : new URL(tab.url).hostname;
        if (!hostname) continue;

        if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
        groupMap[hostname].tabs.push(tab);
      } catch {
        // Skip malformed URLs.
      }
    }

    if (landingTabs.length > 0) {
      groupMap.__landing_pages__ = { domain: '__landing-pages__', tabs: landingTabs };
    }

    const landingHostnames = new Set(landingPagePatterns.map((pattern) => pattern.hostname).filter(Boolean));
    const landingSuffixes = landingPagePatterns.map((pattern) => pattern.hostnameEndsWith).filter(Boolean);

    function isLandingDomain(domain) {
      if (landingHostnames.has(domain)) return true;
      return landingSuffixes.some((suffix) => domain.endsWith(suffix));
    }

    return Object.values(groupMap).sort((a, b) => {
      const aIsLanding = a.domain === '__landing-pages__';
      const bIsLanding = b.domain === '__landing-pages__';
      if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

      const aIsPriority = isLandingDomain(a.domain);
      const bIsPriority = isLandingDomain(b.domain);
      if (aIsPriority !== bIsPriority) return aIsPriority ? -1 : 1;

      return b.tabs.length - a.tabs.length;
    });
  }

  const exported = {
    DEFAULT_LANDING_PAGE_PATTERNS,
    buildDomainGroups,
    filterRealTabs,
    isLandingPage,
    matchCustomGroup,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  global.TabOutHelpers = exported;
}(typeof globalThis !== 'undefined' ? globalThis : this));
