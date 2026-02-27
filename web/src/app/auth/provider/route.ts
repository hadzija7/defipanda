import { NextResponse } from "next/server";

import "@/lib/auth/providers/setup";
import { AuthFacade } from "@/lib/auth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metadata = AuthFacade.getActiveProviderMetadata();
  const linkedSmartAccountProvider = AuthFacade.getLinkedSmartAccountProvider();
  return NextResponse.json({
    provider: metadata.id,
    displayName: metadata.displayName,
    capabilities: metadata.capabilities,
    linkedSmartAccountProvider,
  });
}
