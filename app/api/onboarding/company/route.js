import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Put your logic here instead of calling another route
    // Example:
    console.log("Received:", body);
    
    return NextResponse.json({ success: true, data: body }, { status: 200 });
    
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
