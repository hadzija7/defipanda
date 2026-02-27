import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORCHESTRATOR_URL = "https://v1.orchestrator.rhinestone.dev";

function getApiKey(): string {
  const apiKey = process.env.RHINESTONE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RHINESTONE_API_KEY is not configured. Set it in .env.local (server-side only, no NEXT_PUBLIC_ prefix).",
    );
  }
  return apiKey;
}

async function handleRequest(
  request: NextRequest,
  params: { path: string[] },
) {
  try {
    const apiKey = getApiKey();

    const path = params.path.join("/");
    const url = new URL(request.url);
    const targetUrl = new URL(`${ORCHESTRATOR_URL}/${path}`);
    targetUrl.search = url.search;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };

    const forwardHeaders = ["user-agent", "accept", "accept-language"];
    for (const headerName of forwardHeaders) {
      const value = request.headers.get(headerName);
      if (value) {
        headers[headerName] = value;
      }
    }

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch (error) {
        console.error("Error reading request body:", error);
      }
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        ...(response.headers.get("retry-after")
          ? { "retry-after": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch (error) {
    console.error("Orchestrator proxy error:", error);
    return NextResponse.json(
      {
        error: "Internal proxy error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handleRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handleRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handleRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handleRequest(request, await params);
}
