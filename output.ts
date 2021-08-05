import {writeToStream} from "fast-csv";
import * as fs from "fs";

export const createHtmlCache = (data, url) => {
  const omniDateExec = /wiki\/(.*)\/(.*)$/.exec(url);
  const omniDate = omniDateExec[1].replace(/\//g,`_`);
  const omniPage = omniDateExec[2];
  if(!fs.existsSync(`./${omniDate}/`)){
    fs.mkdirSync(`./${omniDate}`);
  }

  fs.writeFileSync(`./${omniDate}/${omniPage}.html`, data);
}

export const createHoversCSV = (data) => {
  return new Promise<void>((resolve, reject) => {
    const outPath = `./omni_hovers.csv`;
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

export const createLinksFile = (data) => {
  const outPath = `./omni_links.csv`;
  fs.writeFileSync(outPath, data.join('\n'));
  console.log(`Finished writing links to ${outPath}`);
}
