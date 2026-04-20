const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDomainGroups,
  filterRealTabs,
  isLandingPage,
  matchCustomGroup,
} = require('../extension/helpers.js');

test('filterRealTabs removes browser internal pages', () => {
  const tabs = [
    { url: 'https://example.com' },
    { url: 'chrome://extensions/' },
    { url: 'chrome-extension://abc/index.html' },
    { url: 'about:blank' },
    { url: 'edge://settings' },
    { url: 'brave://settings' },
    { url: 'file:///tmp/demo.txt' },
  ];

  assert.deepEqual(
    filterRealTabs(tabs).map((tab) => tab.url),
    ['https://example.com', 'file:///tmp/demo.txt'],
  );
});

test('isLandingPage recognizes built-in landing page rules', () => {
  const patterns = [
    {
      hostname: 'mail.google.com',
      test: (_pathname, url) => !url.includes('#inbox/') && !url.includes('#sent/') && !url.includes('#search/'),
    },
    { hostname: 'x.com', pathExact: ['/home'] },
  ];

  assert.equal(isLandingPage('https://x.com/home', patterns), true);
  assert.equal(isLandingPage('https://mail.google.com/mail/u/0/#inbox/FMfcgz', patterns), false);
  assert.equal(isLandingPage('https://mail.google.com/mail/u/0/#label/work', patterns), true);
});

test('matchCustomGroup supports hostname suffix and path prefix', () => {
  const rules = [
    {
      hostnameEndsWith: '.notion.so',
      pathPrefix: '/workspace',
      groupKey: 'notion-workspace',
      groupLabel: 'Workspace',
    },
  ];

  assert.equal(
    matchCustomGroup('https://acme.notion.so/workspace/roadmap', rules).groupKey,
    'notion-workspace',
  );
  assert.equal(
    matchCustomGroup('https://acme.notion.so/private/wiki', rules),
    null,
  );
});

test('buildDomainGroups prioritizes landing pages, applies custom groups, and keeps file tabs', () => {
  const tabs = [
    { url: 'https://github.com/', title: 'GitHub' },
    { url: 'https://github.com/openai/openai', title: 'Repo' },
    { url: 'https://docs.internal.example.com/wiki/page', title: 'Wiki' },
    { url: 'https://a.internal.example.com/wiki/other', title: 'Wiki 2' },
    { url: 'https://news.ycombinator.com/item?id=1', title: 'HN' },
    { url: 'file:///tmp/notes.txt', title: 'Notes' },
  ];

  const groups = buildDomainGroups(tabs, {
    localCustomGroups: [
      {
        hostnameEndsWith: '.internal.example.com',
        pathPrefix: '/wiki',
        groupKey: 'internal-wiki',
        groupLabel: 'Internal Wiki',
      },
    ],
  });

  assert.equal(groups[0].domain, '__landing-pages__');
  assert.equal(groups[0].tabs.length, 1);

  const customGroup = groups.find((group) => group.domain === 'internal-wiki');
  assert.ok(customGroup);
  assert.equal(customGroup.label, 'Internal Wiki');
  assert.equal(customGroup.tabs.length, 2);

  const githubGroup = groups.find((group) => group.domain === 'github.com');
  assert.ok(githubGroup);
  assert.equal(githubGroup.tabs.length, 1);

  const fileGroup = groups.find((group) => group.domain === 'local-files');
  assert.ok(fileGroup);
  assert.equal(fileGroup.tabs.length, 1);
});
