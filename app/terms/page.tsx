import type { Metadata } from "next";

import LegalPage from "@/app/legal/LegalPage";
import { LIVE_COPY } from "@/lib/client.config";

export const metadata: Metadata = { title: LIVE_COPY.legal.terms.title };

export default function Terms() {
  return <LegalPage doc={LIVE_COPY.legal.terms} />;
}
