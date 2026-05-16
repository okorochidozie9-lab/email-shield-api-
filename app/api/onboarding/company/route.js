import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "https://churn-shield-engine.vercel.app";

export async function POST(request) {
  try {
    const body = await request.json();
    const apiKey = request.headers.get("x-api-key");
    
    if (!apiKey) {
      return NextResponse.json({ error: "Missing x-api-key" }, { status: 401 });
    }

    // Determine which endpoint to proxy to based on the path
    const url = new URL(request.url);
    const targetPath = url.pathname.includes("impression") 
      ? "/help/impression" 
      : "/help/feedback";

    const res = await fetch(`${BACKEND_URL}${targetPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    
    return NextResponse.json(data, { status: res.status });
    
  } catch (err) {
    console.error("Churn Shield API proxy error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
