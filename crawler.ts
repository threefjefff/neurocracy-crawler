import * as dotenv from 'dotenv';
import axios from 'axios';
import * as fs from 'fs';
import { default as cookieJarSupport} from 'axios-cookiejar-support';
import * as tough from 'tough-cookie';
import {parse, HTMLElement} from 'node-html-parser';
import * as htmlEntities from 'html-entities';

dotenv.config({path: 'config.env'});

console.log(process.env.OMNIPEDIA_DATE);

const client = axios.create({withCredentials:true});
cookieJarSupport(client);
client.defaults.jar = new tough.CookieJar();

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

const login = async (): Promise<void> => {
  try {
    const userPage = await client.get(process.env.LOGIN_LINK);
  } catch (e){
    console.log(e);
  }
}
const crawlPage = async (): Promise<void> => {
  await login();
  const omniDate = process.env.OMNIPEDIA_DATE;
  client.defaults.baseURL = 'https://omnipedia.app/'
  console.log('Pulling the main page');
  const mainPage = await client.get(`/wiki/${omniDate}/Main_Page`);
  const page = parse(mainPage.data);
  //const page = parse(fs.readFileSync('main-page.html', {encoding: 'utf8'}));
  const content = page.querySelectorAll('a').map(a => parseAnchor(a)).filter(a => a)
  console.log(content.filter(a => !isOmniLink(a)))

  console.log(content.filter(a => isOmniLink(a)).filter(a => isContentLink(<OmniLink>a, omniDate)));
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

(async () => await crawlPage())();
