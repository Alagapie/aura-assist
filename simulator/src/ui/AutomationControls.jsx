import { PowerOff, Sparkles, Zap } from 'lucide-react'
import { MODE_LIST } from '../automation/modes'
import { useRoomStore } from '../store/useRoomStore'
import { ModeIcon } from './icons'

/** Scene buttons shared by the sidebar and the hub's contextual panel. */
export function ModeGrid() {
  const activeMode = useRoomStore((s) => s.activeMode)
  const applyMode = useRoomStore((s) => s.applyMode)

  return (
    <div className="mode-grid">
      {MODE_LIST.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`mode ${activeMode === mode.label ? 'mode--active' : ''}`}
          onClick={() => applyMode(mode.id)}
          title={`${mode.label.replace(' Mode', '')} — ${mode.hint}`}
        >
          <span className="mode__icon"><ModeIcon mode={mode.id} /></span>
          <span className="mode__label">{mode.label.replace(' Mode', '')}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * What the last scene actually did. Scenes are selective — a device that is not
 * mentioned by a scene keeps whatever state it had — so showing the reach of the
 * last scene is the honest way to report it.
 */
function SceneOutcome() {
  const lastScene = useRoomStore((s) => s.lastScene)
  const activeMode = useRoomStore((s) => s.activeMode)
  if (!lastScene) return null
  return (
    <div className="scene-outcome">
      <span className="scene-outcome__badge">{activeMode}</span>
      <span>
        Set <strong>{lastScene.devices}</strong> device{lastScene.devices === 1 ? '' : 's'} across{' '}
        <strong>{lastScene.rooms}</strong> room{lastScene.rooms === 1 ? '' : 's'}.
      </span>
    </div>
  )
}

/**
 * Automation panel: the household scenes plus the master switches. Every button
 * performs a real state change through the same commit path as the 3D scene.
 */
export function AutomationControls() {
  const allLightsOff = useRoomStore((s) => s.allLightsOff)
  const allOff = useRoomStore((s) => s.allOff)
  const activeMode = useRoomStore((s) => s.activeMode)

  return (
    <section className="card glass scene-card">
      <div className="card__head">
        <Zap size={13} color="#5eead4" />
        <span className="card__title">Household scenes</span>
        <span className="chip chip--accent" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 10.5 }}>
          {activeMode}
        </span>
      </div>
      <ModeGrid />
      <SceneOutcome />
      <div className="master-row">
        <button type="button" className="btn" onClick={allLightsOff}>
          <Sparkles size={13} /> Lights off
        </button>
        <button type="button" className="btn btn--warn" onClick={allOff}>
          <PowerOff size={13} /> All off
        </button>
      </div>
    </section>
  )
}
