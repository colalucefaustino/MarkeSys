import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID,
  })
}
