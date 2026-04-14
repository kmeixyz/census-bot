// pages/_app.js
import "../styles/globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import ScrollbarReveal from "../components/ScrollbarReveal";

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <ScrollbarReveal />
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
