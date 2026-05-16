import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function POST(req) {
  try {
    const body = await req.json();
    
    // Replace this with your actual logic from the old backend
    const { companyName, email } = body;
    
    await redis.set(`company:${email}`, JSON.stringify(body));
    
    return Response.json({ success: true, message: "Company onboarded" }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ message: "API is live" });
}
