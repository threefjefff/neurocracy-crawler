import * as dotenv from 'dotenv';
import axios from 'axios';
import { default as cookieJarSupport} from 'axios-cookiejar-support';
import { parse, HTMLElement } from 'node-html-parser';
import * as htmlEntities from 'html-entities';
import {difference, groupBy, indexOf, map, union, uniq} from 'lodash';
import {fetchCookieJar, login, storeCookieJar} from "./login";
import {createHoversCSV, createHtmlCache, createLinksFile} from "./output";

dotenv.config({path: 'config.env'});

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

let visitedPages: string[] = [];
let failedVisits: string[] = [];

const crawl = async (): Promise<void> => {
  const jar = fetchCookieJar();
  client.defaults.baseURL = 'https://omnipedia.app/'
  client.defaults.jar = jar;
  try {
    await login(client, jar);
    console.log('Starting from the beginning of known history, the date in which Tony blessed us all with Omnipedia, 2049/09/28');
    const hovers = await crawlPage(`/wiki/2049/09/28/Main_Page`);

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
    console.log('Failed to grab the following pages. Bug or legit? Only Tony knows for sure.')
    console.log(failedVisits);
  } catch (e) {
    console.log(e.message);
    console.log('If this is a 404, somethings likely gone wrong logging you in')
    console.log('520 is cause Cloudflare doesnt like it when you spam requests lots of times in a row. Usually we get away with this cause it takes time to consume a page!')
  } finally {
    storeCookieJar(jar);
  }
}

const crawlPage = async (page: string): Promise<OmniHover[]> => {
  if(indexOf(visitedPages, page) > 0){
    //Shortcircuit visited pages
    return [];
  }
  console.log(`Fetching ${page}`);
  let result;
  try {
    result = await client.get(page);
  } catch (e) {
    failedVisits.push(page);
    return [];
  }
  const pageData = parse(result.data);
  createHtmlCache(result.data, page);
  const allVersions = [...getOtherOmniDates(pageData)];
  let [foundLinks, hovers] = parsePageVersion(pageData, page);
  //This page is now harvested. Time to loop through all other versions of this page, and harvest those too.
  for(const version of allVersions) {
    console.log(`Fetching version ${version}`);
    const versionResult = await client.get(version);
    const versionData = parse(versionResult.data);
    const [versionLinks, versionHovers] = parsePageVersion(versionData, version);
    foundLinks = union(foundLinks, versionLinks);
    hovers = union(hovers, versionHovers);
    await sleep(500); //Lets try to reduce the 520ing
  }
  //One last check to make sure that all visited pages are out the foundLinks list
  foundLinks = difference(foundLinks, visitedPages);
  //Now we have a list of pages to visit that have appeared on this page!
  console.log({visitedPages, foundLinks});
  for(const link of foundLinks) {
    const childHovers = await crawlPage(link);
    hovers = union(hovers, childHovers);
  }
  return hovers;
}

const parsePageVersion = (pageData, page): [string[], OmniHover[]] => {
  visitedPages.push(page);
  createHtmlCache(pageData, page);
  let [foundLinks, hovers] = parsePageContent(pageData, page);
  foundLinks = difference(uniq(foundLinks), visitedPages);
  return [foundLinks, hovers];
}

const getOtherOmniDates = (pageData) => {
  const versionDateLinks = pageData.querySelectorAll('.omnipedia-wiki-page-revisions__item > a').map(a => parseAnchor(a)).filter(a => a).reverse();
  return versionDateLinks.filter(a => isOmniLink(a))
    .filter(a => isContentLink(<OmniLink>a))
    .map(a => (<OmniLink>a).href);
}

const parsePageContent = (pageData, page): [string[], OmniHover[]] => {

  const content = pageData.querySelectorAll('a').map(a => parseAnchor(a)).filter(a => a);
  let hovers = content.filter(a => !isOmniLink(a)).map(a => <OmniHover>{...a, page});
  let foundLinks = content.filter(a => isOmniLink(a))
    .filter(a => isContentLink(<OmniLink>a))
    .map(a => (<OmniLink>a).href);

  return [foundLinks, hovers];
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

const isContentLink = (a: OmniLink): boolean => {
  return a.href?.startsWith('/wiki/') && !a.href?.includes('Special%3ARandom') && !a.href?.includes('/changes') && !a.href?.includes('File%3')
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => await crawl())();
