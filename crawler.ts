import * as dotenv from 'dotenv';
import axios from 'axios';
import { default as cookieJarSupport} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import * as htmlEntities from 'html-entities';
import { readFileSync, writeFileSync } from 'fs';
import {difference, groupBy, indexOf, map, union, uniq} from 'lodash';
import {writeToStream} from "fast-csv";
import * as fs from "fs";

dotenv.config({path: 'config.env'});

console.log(process.env.OMNIPEDIA_DATE);

const client = axios.create({withCredentials:true});
cookieJarSupport(client);

interface OmniLink {
  href: string;
}

interface OmniHover extends OmniHoverInfo {
  page: string;
}

interface OmniHoverInfo {
  highlight: string;
  body: string;
}

const isOmniLink = (a: OmniLink | OmniHoverInfo): a is OmniLink  => {
  return (<OmniLink>a).href !== undefined;
}

let visitedPages: string[] = []

const crawl = async (): Promise<void> => {
  let jar: CookieJar;
  try {
    jar = CookieJar.fromJSON(readFileSync('cookie.jar', {encoding: 'utf-8'}));
  } catch (e) {
    console.log(`Can't find cookie jar, creating a fresh one`);
    console.log(e);
    jar = new CookieJar();
  }
  client.defaults.jar = jar;
  try {
    await login(jar);
    const omniDate = process.env.OMNIPEDIA_DATE;
    client.defaults.baseURL = 'https://omnipedia.app/'
    console.log('Pulling the main page');
    const hovers = await crawlPage(`/wiki/${omniDate}/Main_Page`, omniDate);

    //Making an assumption that highlights don't change. Not seen a place where the highlight changes between terms so far.
    const groupedHovers = map(groupBy(hovers, 'highlight'), (group) => {
      return {
        highlight: group[0].highlight,
        body: group[0].body,
        pages: uniq(group.map(articles => articles.page))
      }
    });

    await createHoversCSV(groupedHovers);
    createLinksFile(visitedPages);
  } catch (e) {
    console.log(e.message);
    console.log('If this is a 404, somethings likely gone wrong logging you in')
    console.log('520 is cause Cloudflare doesnt like it when you spam requests lots of times in a row. Usually we get away with this cause it takes time to consume a page!')
  } finally {
    writeFileSync('cookie.jar', JSON.stringify(jar.toJSON()));
  }
}

const login = async (jar: CookieJar): Promise<void> => {
  try {
    const omniCookies = await jar.getCookies('https://omnipedia.app/');
    const expiry = omniCookies.filter(cookie => cookie.key.startsWith('SSESS')).map(cookie => cookie.expires);
    if(expiry.length > 0){
      const exp = expiry[0];
      if(exp === 'Infinity') return; //The cookie will never expire. You're immortal!
      if(Date.now() < exp.getTime()) return; //The cookie hasn't expired yet, you should be good to go.
    }
    console.log('Cookie not found, or expired. Fetching a new one.')
    await client.get(process.env.LOGIN_LINK);
  } catch (e){
    console.log(e);
  }
}
const crawlPage = async (page: string, omniDate: string): Promise<OmniHover[]> => {
  if(indexOf(visitedPages, page) > 0){
    //Shortcircuit visited pages
    return [];
  }
  console.log(`Fetching ${page}`);
  const result = await client.get(page);
  visitedPages.push(page);
  const pageData = parse(result.data);
  const content = pageData.querySelectorAll('a').map(a => parseAnchor(a)).filter(a => a)
  let hovers = content.filter(a => !isOmniLink(a)).map(a => <OmniHover>{...a, page});
  let foundLinks = content.filter(a => isOmniLink(a))
    .filter(a => isContentLink(<OmniLink>a, omniDate))
    .map(a => (<OmniLink>a).href);
  foundLinks = difference(uniq(foundLinks), visitedPages);
  for(const link of foundLinks) {
    const childHovers = await crawlPage(link, omniDate);
    hovers = union(hovers, childHovers);
  }
  return hovers;
}

const parseAnchor = (a: HTMLElement) : OmniLink | OmniHoverInfo | undefined => {
  const link = a.getAttribute('href');
  if(link){
    return {
      href: link
    }
  } else if(a.getAttribute('data-omnipedia-attached-data-title')) {
    return {
      highlight: htmlEntities.decode(a.getAttribute('data-omnipedia-attached-data-title')),
      body: htmlEntities.decode(a.getAttribute('data-omnipedia-attached-data-content'))
    }
  }
}

const isContentLink = (a: OmniLink, omniDate: string): boolean => {
  return a.href?.includes(omniDate) && !a.href?.includes('Main_Page')
}

const createHoversCSV = (data) => {
  return new Promise<void>((resolve, reject) => {
    const outPath = `./${process.env.OMNIPEDIA_DATE.replace(/\//g,`_`)}__hovers.csv`;
    const ws = fs.createWriteStream(outPath);
    ws.on('error', reject);
    ws.on('finish', () => {
      console.log(`Finished writing hovers to ${outPath}`);
      resolve();
    });
    writeToStream(ws, data, {headers: ['highlight', 'body', 'pages'], delimiter: '\t'})
      .on('error', err => reject(err))
      .on('finish', () => ws.end());
  });
}

const createLinksFile = (data) => {
  const outPath = `./${process.env.OMNIPEDIA_DATE.replace(/\//g,`_`)}__links.csv`;
  fs.writeFileSync(outPath, data.join('\n'));
  console.log(`Finished writing links to ${outPath}`);
}

(async () => await crawl())();
