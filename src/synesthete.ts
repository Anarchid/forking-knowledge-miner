/**
 * Synesthete — auto-generates evocative session names via a quick Haiku call.
 *
 * Called after a few user messages in an auto-named session. Produces a
 * 2–4 word name that captures the session's topic/mood.
 */

import type { Membrane } from 'membrane';

const NAMING_PROMPT = `You are a session naming assistant. Given a brief summary of a conversation, generate a short, evocative name (2-4 words) that captures its essence. The name should be memorable and descriptive, like a chapter title.

Examples of good names:
- "Zulip Thread Archaeology"
- "Lobby Protocol Dissection"
- "Context Window Budgeting"
- "Agent Memory Architecture"
- "Discord Bridge Debugging"

Respond with ONLY the name, nothing else. No quotes, no explanation.`;

/**
 * Generate a session name from conversation content.
 * Returns the generated name, or null if the call fails.
 */
export async function generateSessionName(
  membrane: Membrane,
  conversationSummary: string,
): Promise<string | null> {
  try {
    const response = await membrane.complete({
      messages: [
        {
          participant: 'user',
          content: [{ type: 'text', text: conversationSummary }],
        },
      ],
      system: NAMING_PROMPT,
      config: {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 30,
        temperature: 0.8,
      },
    });

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // Sanity check: should be short and non-empty
    if (!text || text.length > 60 || text.includes('\n')) return null;
    return text;
  } catch {
    return null;
  }
}
