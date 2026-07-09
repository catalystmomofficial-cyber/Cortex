import { langSay } from './languages'

// Builds the advisor's system prompt from the user's stored business context,
// so both the text Advisor and Voice Mode give grounded, specific guidance.
export function buildSystemPrompt(state, opts = {}) {
  const { profile, goals, ideas } = state
  const language = langSay(state.settings?.language || 'en-US')
  const lines = [
    "You are Cortex, the user's sharp, private business advisor. You speak like an experienced operator and co-founder, not a corporate consultant.",
    'Be direct, concise, and practical. When speaking aloud, keep answers tight — a few sentences, no markdown, no bullet symbols.',
    // Voice Mode: replies are spoken, so keep them very short — this makes the
    // spoken answer start almost immediately and never time out mid-generation.
    ...(opts.voice
      ? ['This is a spoken voice conversation. Answer in at most 2-3 short sentences. Get to the point in the first sentence. No lists, no preamble.']
      : []),
    `Respond in ${language}. If the user clearly writes or speaks in a different language, mirror their language instead.`,
    "When the conversation produces concrete plans, goals, or next actions, briefly offer to organize them into their plan (they can tap “Organize into my plan” to file them into Goals, Today's One Thing, and the Weekly Pulse).",
    'You have full context on their business below. Reference their actual goals and ideas. Never invent facts you were not given.',
    '',
    '## Business context',
    `Business / what they do: ${profile.business || 'not provided'}`,
    `Customer: ${profile.customer || 'not provided'}`,
    `Offer: ${profile.offer || 'not provided'}`,
    `90-day win: ${profile.win90 || 'not provided'}`,
    `Today's focus: ${profile.focus || 'not set'}`,
  ]

  if (goals.length) {
    lines.push('', '## Current goals')
    const labels = { on: 'On Track', risk: 'At Risk', off: 'Off Track', overdue: 'Overdue' }
    for (const g of goals) {
      lines.push(
        `- ${g.title} [${labels[g.status] || g.status}]${g.win ? ` — win: ${g.win}` : ''}${g.due ? ` — due ${g.due}` : ''}`
      )
    }
  }
  if (ideas.length) {
    lines.push('', '## Recent captured ideas')
    for (const i of ideas.slice(0, 12)) lines.push(`- ${i.text}`)
  }
  return lines.join('\n')
}

// System instruction for turning a conversation into structured plan items.
export function buildPlanExtractionPrompt() {
  return [
    'You convert a business conversation into structured planning items for the Cortex app.',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "goals": [{ "title": string, "domain": "growth"|"finance"|"operations", "status": "on"|"risk"|"off"|"overdue", "win": string, "due": string }],',
    '  "focus": string,',
    '  "pulse": { "win": string, "blocker": string, "focus": string },',
    '  "ideas": [string]',
    '}',
    'Rules:',
    '- Only include items clearly implied by the conversation. If a section has nothing, use an empty array, or "" for focus, or null for pulse.',
    '- "domain" must be growth, finance, or operations — choose the best fit.',
    '- "status" defaults to "on" unless the conversation says otherwise.',
    '- "due" is an ISO date (YYYY-MM-DD) only if a clear date was discussed, else "".',
    '- "win" is a short success criterion for the goal, else "".',
    '- "focus" is the single most important next action ("Today\'s One Thing"), else "".',
    '- "pulse" only if a weekly review/check-in was discussed (win, blocker, next focus), else null.',
    '- Keep all titles short and actionable. Do not invent facts.',
  ].join('\n')
}
