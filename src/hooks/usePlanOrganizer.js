import { useState } from 'react'
import { useStore } from '../store'
import { generateJSON } from '../lib/gemini'
import { buildPlanExtractionPrompt } from '../lib/prompt'

// Shared "Organize into my plan" logic used by both the Advisor and Voice Mode.
// Reads the shared advisor conversation, extracts structured items via Gemini,
// and applies the user-approved selection into the store.
export function usePlanOrganizer() {
  const { state, dispatch } = useStore()
  const [organizing, setOrganizing] = useState(false)
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')

  async function organize() {
    const messages = state.advisor.messages
    if (organizing || !messages.length) return
    setPlanError('')
    setOrganizing(true)
    try {
      const transcript = messages
        .map((m) => `${m.role === 'assistant' ? 'Advisor' : 'You'}: ${m.content}`)
        .join('\n')
      const result = await generateJSON({
        system: buildPlanExtractionPrompt(),
        messages: [{ role: 'user', content: `Conversation:\n${transcript}\n\nReturn the JSON plan.` }],
      })
      const normalized = {
        goals: Array.isArray(result?.goals) ? result.goals.filter((g) => g && g.title) : [],
        focus: typeof result?.focus === 'string' ? result.focus.trim() : '',
        pulse:
          result?.pulse && (result.pulse.win || result.pulse.blocker || result.pulse.focus)
            ? result.pulse
            : null,
        ideas: Array.isArray(result?.ideas)
          ? result.ideas.filter((s) => typeof s === 'string' && s.trim())
          : [],
      }
      if (!normalized.goals.length && !normalized.focus && !normalized.pulse && !normalized.ideas.length) {
        setPlanError('Nothing to organize yet — make some plans first.')
      } else {
        setPlan(normalized)
      }
    } catch (e) {
      setPlanError(e.message === 'NO_SERVER_KEY' ? 'AI isn’t connected yet.' : 'Could not organize right now. Try again.')
    } finally {
      setOrganizing(false)
    }
  }

  function applyPlan(selected, onApplied) {
    selected.goals.forEach((g) =>
      dispatch({
        type: 'ADD_GOAL',
        title: g.title,
        win: g.win || '',
        status: ['on', 'risk', 'off', 'overdue'].includes(g.status) ? g.status : 'on',
        due: g.due || '',
        domain: ['growth', 'finance', 'operations'].includes(g.domain) ? g.domain : 'growth',
      })
    )
    if (selected.focus) dispatch({ type: 'UPDATE_PROFILE', patch: { focus: selected.focus } })
    if (selected.pulse) dispatch({ type: 'ADD_PULSE', pulse: selected.pulse })
    selected.ideas.forEach((text) => dispatch({ type: 'ADD_IDEA', text }))
    setPlan(null)
    onApplied?.()
  }

  return { organize, organizing, plan, setPlan, planError, applyPlan }
}
