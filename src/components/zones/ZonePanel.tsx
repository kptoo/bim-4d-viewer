import { useState }           from 'react'
import { useCreateLayer }     from '../../hooks/useLayers'
import { LAYER_CATEGORY_META } from '../../types'
import type { LayerCategory }  from '../../types'

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF5722', '#607D8B', '#795548', '#9E9E9E', '#CDDC39',
]
function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

// ── Category helpers ──────────────────────────────────────────────────────────

function categoryMeta(category: string) {
  return (
    LAYER_CATEGORY_META.find(m => m.value === category) ??
    { value: category, label: category, icon: '🏷️' }
  )
}

const CATEGORY_PLACEHOLDER: Record<string, string> = {
  'building-elements': 'Building element name…',
  'zones':             'Zone name (e.g. Floor 1, Apartment A101)…',
  'costs':             'Cost zone name…',
  'resources':         'Resource group name…',
  'quality':           'Quality zone name…',
  'waste':             'Waste zone name…',
  'safety':            'Safety zone name…',
  'coclass':           'CoClass zone name…',
  'ai-generated':      'AI-generated zone name…',
  'custom':            'Custom zone name…',
}

// ── ZonePanel ──────────────────────────────────────────────────────────────────

export default function ZonePanel() {
  const createMutation = useCreateLayer()

  const [name,     setName]     = useState('')
  const [color,    setColor]    = useState(randomColor)
  const [category, setCategory] = useState<LayerCategory>('zones')

  const meta        = categoryMeta(category)
  const heading     = meta.label.toUpperCase()
  const placeholder = CATEGORY_PLACEHOLDER[category] ?? 'Zone name…'

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createMutation.mutate(
      { payload: { name: trimmed, category, color, description: null } },
      {
        onSuccess: () => {
          setName('')
          setColor(randomColor())
          setTimeout(() => createMutation.reset(), 3000)
        },
      }
    )
  }

  return (
    <div className="zp-create-panel">

      {/* ── Panel title ─────────────────────────────────────── */}
      <div className="zp-create-panel__header">
        <span className="zp-create-panel__title">Create Zone</span>
      </div>

      {/* ── Creation form ────────────────────────────────────── */}
      <div className="zp-create-panel__body">

        <div className="zp-create-panel__section-label">{heading}</div>

        {/* Name + color row */}
        <div className="zp-create-panel__row">
          <input
            className="zp-create-panel__input"
            type="text"
            placeholder={placeholder}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            maxLength={80}
          />
          <input
            type="color"
            className="zp-create-panel__color"
            value={color}
            onChange={e => setColor(e.target.value)}
            title="Choose zone color"
          />
        </div>

        {/* Category selector */}
        <select
          className="zp-create-panel__category"
          value={category}
          onChange={e => setCategory(e.target.value as LayerCategory)}
        >
          {LAYER_CATEGORY_META.map(m => (
            <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
          ))}
        </select>

        {/* Submit */}
        <button
          className="zp-create-panel__btn"
          onClick={handleSubmit}
          disabled={createMutation.isPending || !name.trim()}
        >
          {createMutation.isPending ? '…' : '＋ Create Zone'}
        </button>

        {/* Feedback */}
        {createMutation.isSuccess && (
          <div className="zp-create-panel__success">
            ✓ Zone created. Open <strong>Existing Zones</strong> to assign objects and manage it.
          </div>
        )}
        {createMutation.isError && (
          <div className="zp-create-panel__error">
            {(createMutation.error as Error).message}
          </div>
        )}

      </div>

      {/* ── Hint ─────────────────────────────────────────────── */}
      <div className="zp-create-panel__hint">
        <span className="zp-create-panel__hint-icon">💡</span>
        <span>
          After creating a zone, switch to the <strong>Existing Zones</strong> tab
          to assign selected IFC objects, filter the model, and manage your zones.
        </span>
      </div>

    </div>
  )
}