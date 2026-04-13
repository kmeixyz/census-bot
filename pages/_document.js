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
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
