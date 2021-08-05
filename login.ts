import {CookieJar} from "tough-cookie";
import {AxiosInstance} from "axios";
import {readFileSync, writeFileSync} from "fs";

const COOKIE_JAR_LOCATION = './cookie-jar.omni'

export const login = async (client: AxiosInstance, jar: CookieJar): Promise<void> => {
  try {
    const omniCookies = await jar.getCookies('https://omnipedia.app/');
    const expiry = omniCookies.filter(cookie => cookie.key.startsWith('SSESS')).map(cookie => cookie.expires);
    if(expiry.length > 0){
      const exp = expiry[0];
      if(exp === 'Infinity') return; //The cookie will never expire. You're immortal!
      if(Date.now() < exp.getTime()) return; //The cookie hasn't expired yet, you should be good to go.
    }
    console.log('Cookie not found, or expired. Fetching a new one.')
    await client.post('/user/login', new URLSearchParams({name: process.env.OMNI_USERNAME, pass: process.env.OMNI_PASSWORD, op: 'Log in', form_id: 'user_login_form'}), {headers: {'Content-Type': "application/x-www-form-urlencoded"}} );
  } catch (e){
    console.log(e);
  }
}

export const fetchCookieJar = (): CookieJar => {
  let jar: CookieJar;
  try {
    jar = CookieJar.fromJSON(readFileSync(COOKIE_JAR_LOCATION, {encoding: 'utf-8'}));
  } catch (e) {
    console.log(`Can't find cookie jar, creating a fresh one`);
    console.log(e);
    jar = new CookieJar();
  }
  return jar;
}

export const storeCookieJar = (jar: CookieJar): void => {
  writeFileSync(COOKIE_JAR_LOCATION, JSON.stringify(jar.toJSON()));
}
