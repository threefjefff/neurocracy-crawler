import * as dotenv from 'dotenv';
import axios, {AxiosResponse} from 'axios';
import { default as cookieJarSupport} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import * as htmlEntities from 'html-entities';
import { readFileSync, writeFileSync } from 'fs';
import {difference, indexOf, uniq} from 'lodash';

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
    jar = CookieJar.fromJSON(readFileSync('cookie.jar', {encoding: 'utf-8', flag: 'f'}));
  } catch (e) {
    jar = new CookieJar();
  }
  client.defaults.jar = jar;
  try {
    await login(); //Can't hurt to try. If it fails, we'll fall back to cookiejar anyways
    const omniDate = process.env.OMNIPEDIA_DATE;
    client.defaults.baseURL = 'https://omnipedia.app/'
    console.log('Pulling the main page');
    const hovers = await crawlPage(`/wiki/${omniDate}/Main_Page`, omniDate);

    console.log(visitedPages);
    console.log(hovers);
  } catch (e) {
    console.log(e);
  } finally {
    writeFileSync('cookie.jar', JSON.stringify(jar.toJSON()));
  }
}

const login = async (): Promise<void> => {
  try {
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
    hovers = [...hovers, ...childHovers];
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
      highlight: a.getAttribute('data-omnipedia-attached-data-title'),
      body: htmlEntities.decode(a.getAttribute('data-omnipedia-attached-data-content'))
    }
  }
}

const isContentLink = (a: OmniLink, omniDate: string): boolean => {
  return a.href?.includes(omniDate) && !a.href?.includes('Main_Page')
}

(async () => await crawl())();
