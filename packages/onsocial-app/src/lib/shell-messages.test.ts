import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from './locale';
import {
  SHELL_CREATE_ERRORS,
  SHELL_HOME_FALLBACKS,
  shellCreateError,
} from './shell-label';

const require = createRequire(
  realpathSync(
    new URL('../../node_modules/next-intl/package.json', import.meta.url)
  )
);
const { createTranslator } = require('use-intl') as {
  createTranslator: (config: {
    locale: string;
    messages: Record<string, unknown>;
    namespace: string;
  }) => (key: string, values?: Record<string, string | number>) => string;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '../../messages');
const en = JSON.parse(readFileSync(join(root, 'en/shell.json'), 'utf8'));
const pl = JSON.parse(readFileSync(join(root, 'pl/shell.json'), 'utf8'));

function keys(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

describe('shell catalogs', () => {
  it('gives Polish every English key', () => {
    expect(keys(pl).sort()).toEqual(keys(en).sort());
  });

  it('keeps the English shell sentences the product already uses', () => {
    expect(en.apps.home).toBe('Home');
    expect(en.apps.groups).toBe('Guilds');
    expect(en.launcher.open).toBe('Open launcher');
    expect(en.launcher.close).toBe('Close launcher');
    expect(en.dock.connect).toBe('Connect');
    expect(en.dock.back).toBe('Back');
    expect(en.account.opening).toBe('Opening…');
    expect(en.account.found).toBe('Found');
    expect(en.account.taken).toBe('Taken');
    expect(en.account.available).toBe('Available');
    expect(en.account.missing).toBe('Not found');
    expect(en.theme.light).toBe('Light');
    expect(en.theme.dark).toBe('Dark');
    expect(en.peekOverflow).toBe('{count, plural, other {# more in {place}}}');
    expect(en.dock.swipeHint).toBe('Swipe up · hold for apps');
    expect(en.dock.swipeHold).toBe('Swipe up for page content. Hold for apps.');
    expect(en.homeEmpty.nothingNew).toBe('Nothing new right now.');
    expect(en.homeEmpty.guildsNone).toBe(
      'You haven’t joined a guild yet. Tap Search to explore, or + to start one.'
    );
    expect(en.homeChrome.latest).toBe('Latest');
    expect(en.homeChrome.createGuild).toBe('Create guild');
    expect(en.homeChrome.openHub).toBe('Open a hub');
    expect(en.homeChrome.createDao).toBe('Create DAO');
    expect(en.face.message).toBe('Message');
    expect(en.face.messageNamed).toBe('Message {name}');
    expect(en.create.name).toBe('Name');
    expect(en.create.hubSubmit).toBe('Open hub');
    expect(en.create.tokenCreate).toBe('Create');
    expect(en.create.discardLookBody).toBe(
      'Name, ID, look, and about won’t be saved.'
    );
    expect(en.look.addBanner).toBe('Add banner');
    expect(en.look.photoOrVideo).toBe('Photo or video');
    expect(en.topics.music).toBe('Music');
    expect(en.topics.all).toBe('All');
    expect(en.discover.creatorHubs).toBe('Creator hubs');
    expect(en.discover.publicGuilds).toBe('Public guilds');
    expect(en.discover.guildsIn).toBe('Guilds · {topic}');
    expect(en.discover.moving).toBe('Moving');
    expect(en.discover.profiles).toBe('Profiles');
    expect(en.discover.topics).toBe('Topics');
    expect(en.discover.tickers).toBe('Tickers');
    expect(en.discover.filterProfiles).toBe('Filter profiles');
    expect(en.discover.people).toBe('People');
    expect(en.discover.orgs).toBe('Orgs');
    expect(en.discover.offers).toBe('Offers');
    expect(en.discover.hiring).toBe('Hiring');
    expect(en.discover.nearDaos).toBe('NEAR DAOs');
    expect(en.discover.trendingTopics).toBe('Trending topics');
    expect(en.discover.trendingTickers).toBe('Trending tickers');
    expect(en.discover.hotPosts).toBe('Hot posts');
    expect(en.discover.seeAll).toBe('See all');
    expect(en.discover.nothingMoving).toBe('Nothing moving yet.');
    expect(en.discover.search).toBe('Search');
    expect(en.discover.clearSearch).toBe('Clear search');
    expect(en.discover.searchAriaMoving).toBe(
      'Search people, articles, books, music, and events'
    );
    expect(en.discover.searchHintMoving).toBe(
      'People, articles, books, music, events'
    );
    expect(en.discover.searchHintRest).toBe('People, #topics, $tickers');
    expect(en.discover.noProfilesYet).toBe('No profiles found yet.');
    expect(en.discover.pressEnter).toBe(
      'Press Enter or pick a suggestion to open this in Home.'
    );
    expect(en.discover.articles).toBe('Articles');
    expect(en.discover.searchResults).toBe('Search results');
    expect(en.discover.searchArticles).toBe('Search articles');
    expect(en.discover.more).toBe('More');
    expect(en.discover.moreArticles).toBe('More articles');
    expect(en.discover.nothingMatches).toBe('Nothing matches.');
    expect(en.taxonomy.anyIndustry).toBe('Any industry');
    expect(en.taxonomy.anyCraft).toBe('Any craft');
    expect(en.taxonomy.organization).toBe('Organization');
    expect(en.taxonomy.writeYourOwn).toBe('Write your own');
    expect(en.taxonomy.sectionWeb3).toBe('Web3 & digital');
    expect(en.taxonomy.craftExamples).toBe('Writer, designer…');
    expect(en.taxonomy.chooseCrafts).toBe('Choose crafts');
    expect(en.taxonomy.changeCrafts).toBe('Crafts, {names}. Change crafts');
    expect(en.taxonomy.craftLimit).toBe('Up to 3. Tap again to remove.');
    expect(en.taxonomy.yourCraft).toBe('Your craft');
    expect(en.taxonomy.addCraft).toBe('Add craft');
    expect(en.taxonomy.craftPlaceholder).toBe('Photographer');
    expect(en.taxonomy.maxCrafts).toBe('Max 3 crafts');
    expect(en.taxonomy.location).toBe('Location');
    expect(en.taxonomy.basedIn).toBe('Based in');
    expect(en.taxonomy.done).toBe('Done');
    expect(en.taxonomy.closeIndustry).toBe('Close industry');
    expect(en.taxonomy.closeLocation).toBe('Close location');
    expect(en.taxonomy.closeCraft).toBe('Close craft');
    expect(en.profileFace.person).toBe('Person');
    expect(en.profileFace.about).toBe('About');
    expect(en.profileFace.aboutHouse).toBe('About');
    expect(en.profileFace.bio).toBe('Bio');
    expect(en.profileFace.leadCrafts).toBe('Lead, crafts, photos, more');
    expect(en.profileFace.leadPhotos).toBe('Lead, photos, more');
    expect(en.profileFace.manageOffers).toBe('Manage offers');
    expect(en.profileFace.manageHiring).toBe('Manage hiring');
    expect(en.profileFace.viewOffers).toBe('View offers');
    expect(en.profileFace.viewRole).toBe('View open role');
    expect(en.topicEditor.alreadyAdded).toBe('Already added');
    expect(en.topicEditor.remove).toBe('Remove {name}');
    expect(en.industries.healthcare).toBe('Healthcare');
    expect(en.industries.realEstate).toBe('Real Estate');
    expect(en.crafts.writer).toBe('Writer');
    expect(en.crafts.designer).toBe('Designer');
    expect(en.apps.groups).toBe('Guilds');
    expect(en.apps.hubs).toBe('Hubs');
    expect(en.apps.daos).toBe('DAOs');
    expect(en.guildCard.memberLed).toBe('Member-led');
    expect(en.guildCard.owner).toBe('Owner');
    expect(en.topicEditor.typeYourOwn).toBe('Or type your own…');
    expect(en.topicEditor.primary).toBe('Primary');
    expect(en.help.guildTitle).toBe('Your guild');
    expect(en.help.hubTitle).toBe('Your hub');
    expect(en.help.tokenTitle).toBe('Creator token');
  });

  it('renders escaped apostrophes as the field placeholder', () => {
    const t = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'create',
    });
    expect(t('guildAboutPlaceholder')).toBe(
      "What this guild does and who it's for."
    );
    expect(t('hubAboutPlaceholder')).toBe(
      "What this hub publishes and who it's for."
    );
    expect(t('daoWhisper', { near: '0.1' })).toBe(
      'You start as council · ~0.1 NEAR'
    );
    const card = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'guildCard',
    });
    expect(card('members', { count: 1 })).toBe('member');
    expect(card('members', { count: 12 })).toBe('members');
    const cardPl = createTranslator({
      locale: 'pl',
      messages: pl,
      namespace: 'guildCard',
    });
    expect(cardPl('members', { count: 1 })).toBe('członek');
    expect(cardPl('members', { count: 4 })).toBe('członków');
    expect(cardPl('members', { count: 12 })).toBe('członków');
    const discover = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'discover',
    });
    expect(discover('loadingMoving')).toBe("Loading what's moving…");
    expect(discover('searchFailed')).toBe('Couldn’t search.');
    expect(discover('resultsPartial')).toBe('Some results didn’t load.');
    expect(discover('loadMoreArticles')).toBe('Couldn’t load more.');
    expect(discover('topicsIn', { tag: 'music' })).toBe('Topics · #music');
    expect(discover('tickersIn', { ticker: 'NEAR' })).toBe('Tickers · $NEAR');
    expect(discover('profileCount', { count: '12.5K' })).toBe('12.5K profiles');
    expect(discover('profileCountOne')).toBe('1 profiles');
    expect(discover('daoCount', { count: '5,310' })).toBe('5,310 NEAR DAOs');
    const taxonomy = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'taxonomy',
    });
    expect(taxonomy('people', { count: 1 })).toBe('1 person');
    expect(taxonomy('people', { count: 12 })).toBe('12 people');
    const taxonomyPl = createTranslator({
      locale: 'pl',
      messages: pl,
      namespace: 'taxonomy',
    });
    expect(taxonomyPl('people', { count: 1 })).toBe('1 osoba');
    expect(taxonomyPl('people', { count: 4 })).toBe('4 osoby');
    expect(taxonomyPl('people', { count: 12 })).toBe('12 osób');
    const face = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'profileFace',
    });
    expect(face('offersCount', { count: 3 })).toBe('Offers · 3');
    expect(face('hiringCount', { count: 2 })).toBe('Hiring · 2');
    expect(face('viewOffersCount', { count: 3 })).toBe('View 3 offers');
    expect(face('viewRoles', { count: 4 })).toBe('View 4 open roles');
    expect(face('craftCount', { count: 1 })).toBe('1 craft');
    expect(face('craftCount', { count: 2 })).toBe('2 crafts');
    expect(face('photoCount', { count: 1 })).toBe('1 photo');
    expect(face('photoCount', { count: 5 })).toBe('5 photos');
    const facePl = createTranslator({
      locale: 'pl',
      messages: pl,
      namespace: 'profileFace',
    });
    expect(facePl('craftCount', { count: 1 })).toBe('1 fach');
    expect(facePl('craftCount', { count: 3 })).toBe('3 fachy');
    expect(facePl('craftCount', { count: 5 })).toBe('5 fachów');
    expect(facePl('photoCount', { count: 1 })).toBe('1 zdjęcie');
    expect(facePl('photoCount', { count: 4 })).toBe('4 zdjęcia');
    expect(facePl('photoCount', { count: 12 })).toBe('12 zdjęć');
  });

  it('maps each create-form error onto its English sentence', () => {
    for (const [sentence, key] of Object.entries(SHELL_CREATE_ERRORS)) {
      const [group, name] = key.split('.');
      expect(en[group][name]).toBe(sentence);
      expect(shellCreateError(sentence)?.key).toBe(key);
    }
    expect(
      shellCreateError('Guild name must be 48 characters or fewer.')
    ).toEqual({
      key: 'createError.guildNameLength',
      values: { max: 48 },
    });
    expect(shellCreateError('Hub ID must be at least 3 characters.')).toEqual({
      key: 'createError.hubIdLength',
      values: { min: 3 },
    });
    expect(shellCreateError('Wallet rejected the transaction.')).toBeNull();
  });

  it('maps each launcher error fallback onto its English sentence', () => {
    for (const [sentence, key] of Object.entries(SHELL_HOME_FALLBACKS)) {
      const [group, name] = key.split('.');
      expect(en[group][name]).toBe(sentence);
    }
  });

  it('lists every locale under its own name in every catalog', () => {
    expect(en.language.en).toBe('English');
    expect(en.language.pl).toBe('Polski');
    for (const code of APP_LOCALES) {
      expect(pl.language[code]).toBe(en.language[code]);
    }
  });
});
