import redirectData from "./old-url-redirects.config.json";

export type OldUrlRedirect = {
  source: string;
  destination: string;
  permanent: boolean;
  note: string;
};

export const oldUrlRedirects: OldUrlRedirect[] = redirectData;
