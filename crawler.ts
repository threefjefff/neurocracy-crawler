import * as dotenv from 'dotenv';
import axios, {AxiosResponse} from 'axios';
import { default as cookieJarSupport} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import * as htmlEntities from 'html-entities';
import { readFileSync, writeFileSync } from 'fs';
import {difference, uniq} from 'lodash';

dotenv.config({path: 'config.env'});

console.log(process.env.OMNIPEDIA_DATE);

const client = axios.create({withCredentials:true});
cookieJarSupport(client);


interface OmniLink {
  href: string;
}

interface OmniHover {
  highlight: string;
  body: string;
}

const isOmniLink = (a: OmniLink | OmniHover): a is OmniLink  => {
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
    const [hover, links] = await crawlPage(`/wiki/${omniDate}/Main_Page`, omniDate);

    //console.log(foundPages);
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
const crawlPage = async (page: string, omniDate: string): Promise<[OmniHover[], string[]]> => {
  console.log(`Fetching ${page}`);
  const result = await client.get(page);
  visitedPages.push(page);
  const pageData = parse(result.data);
  //TODO How come we're hitting visited pages over and over?
  //const page = parse(fs.readFileSync('main-page.html', {encoding: 'utf8'}));
  const content = pageData.querySelectorAll('a').map(a => parseAnchor(a)).filter(a => a)
  const hover = content.filter(a => !isOmniLink(a)).map(a => <OmniHover>a);
  let foundLinks = content.filter(a => isOmniLink(a))
    .filter(a => isContentLink(<OmniLink>a, omniDate))
    .map(a => (<OmniLink>a).href);
  foundLinks = difference(uniq(foundLinks), visitedPages);
  console.log({visited: visitedPages, visitable: foundLinks});
  for(const link of foundLinks) {
   const [ch, cl] = await crawlPage(link, omniDate);
   const diff = difference(cl, visitedPages);
   console.log(diff);
   foundLinks.push(...diff);
  }
  return [hover , foundLinks];
}

const parseAnchor = (a: HTMLElement) : OmniLink | OmniHover | undefined => {
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
