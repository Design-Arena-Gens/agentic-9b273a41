import { NextResponse } from "next/server";
import { processCommand } from "@/lib/agent";

type AgentRequest = {
  command?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;
    if (!body.command || typeof body.command !== "string") {
      return NextResponse.json(
        { error: "A voice command is required." },
        { status: 400 },
      );
    }

    const result = processCommand(body.command);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent route error", error);
    return NextResponse.json(
      {
        error:
          "Sorry, I ran into an issue handling that request. Please try again.",
      },
      { status: 500 },
    );
  }
}
