// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

const themeScript = `
(function(){
  try {
    var k='census-bot-theme';
    var t=localStorage.getItem(k);
    if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);return;}
    if(window.matchMedia('(prefers-color-scheme: light)').matches){
      document.documentElement.setAttribute('data-theme','light');
    }else{
      document.documentElement.setAttribute('data-theme','dark');
    }
  }catch(e){}
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
