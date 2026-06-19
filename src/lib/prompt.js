import { langSay } from './languages'

// Builds the advisor's system prompt from the user's stored business context,
// so both the text Advisor and Voice Mode give grounded, specific guidance.
export function buildSystemPrompt(state) {
  const { profile, goals, ideas } = state
  const language = langSay(state.settings?.language || 'en-US')
  const lines = [
    "You are Cortex, the user's sharp, private business advisor. You speak like an experienced operator and co-founder, not a corporate consultant.",
    'Be direct, concise, and practical. When speaking aloud, keep answers tight — a few sentences, no markdown, no bullet symbols.',
    `Respond in ${language}. If the user clearly writes or speaks in a different language, mirror their language instead.`,
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
