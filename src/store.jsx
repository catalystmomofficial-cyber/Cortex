import { createContext, useContext, useEffect, useReducer } from 'react'
import { uid } from './lib/id'

const STORAGE_KEY = 'cortex.state.v1'

const defaultState = {
  profile: {
    business: '',
    customer: '',
    offer: '',
    win90: '',
  },
  goals: [],
  ideas: [],
  pulses: [],
  settings: {
    geminiKey: '',
    geminiModel: 'gemini-2.0-flash',
  },
  advisor: {
    messages: [],
  },
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    // Shallow-merge so new fields in future versions don't break old data.
    return {
      ...defaultState,
      ...parsed,
      profile: { ...defaultState.profile, ...(parsed.profile || {}) },
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      advisor: { ...defaultState.advisor, ...(parsed.advisor || {}) },
    }
  } catch {
    return defaultState
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'UPDATE_PROFILE':
      return { ...state, profile: { ...state.profile, ...action.patch } }

    case 'ADD_GOAL':
      return {
        ...state,
        goals: [
          {
            id: uid(),
            title: action.title,
            win: action.win || '',
            status: action.status || 'on',
            due: action.due || '',
            createdAt: Date.now(),
          },
          ...state.goals,
        ],
      }

    case 'UPDATE_GOAL':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }

    case 'DELETE_GOAL':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) }

    case 'ADD_IDEA':
      if (!action.text.trim()) return state
      return {
        ...state,
        ideas: [{ id: uid(), text: action.text.trim(), createdAt: Date.now() }, ...state.ideas],
      }

    case 'DELETE_IDEA':
      return { ...state, ideas: state.ideas.filter((i) => i.id !== action.id) }

    case 'ADD_PULSE':
      return {
        ...state,
        pulses: [{ id: uid(), createdAt: Date.now(), ...action.pulse }, ...state.pulses],
      }

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'SET_ADVISOR_MESSAGES':
      return { ...state, advisor: { ...state.advisor, messages: action.messages } }

    case 'CLEAR_ADVISOR':
      return { ...state, advisor: { ...state.advisor, messages: [] } }

    case 'RESET':
      return defaultState

    default:
      return state
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage full or unavailable — ignore */
    }
  }, [state])

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export const STATUS_META = {
  on: { label: 'On Track', dot: 'status-on', color: 'var(--green)' },
  risk: { label: 'At Risk', dot: 'status-risk', color: 'var(--yellow)' },
  off: { label: 'Off Track', dot: 'status-off', color: 'var(--orange)' },
  overdue: { label: 'Overdue', dot: 'status-overdue', color: 'var(--red)' },
}
