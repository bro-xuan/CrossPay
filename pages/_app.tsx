import type { AppProps } from "next/app";
import { PrivyProvider } from "@privy-io/react-auth";
import { ReactElement } from "react";

function MyApp({ Component, pageProps }: AppProps): ReactElement {
  return (
    <PrivyProvider appId="your-privy-app-id">
      <Component {...pageProps} />
    </PrivyProvider>
  );
}

export default MyApp;
