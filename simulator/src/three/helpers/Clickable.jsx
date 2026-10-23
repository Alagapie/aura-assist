import { Html } from '@react-three/drei'
import { useRoomStore } from '../../store/useRoomStore'
import { getPrimaryAction } from '../../config/devices'

/**
 * Wraps any 3D content so it behaves like a smart device:
 *  - hover  -> pointer cursor, highlight, floating name tag
 *  - click  -> select the device and run its primary action
 *  - click on empty space clears the selection (see Canvas onPointerMissed)
 */
export function Clickable({
  id,
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  labelOffset = [0, 0.6, 0],
  transform = false,
  childrenHighlight = true,
}) {
  const hoveredId = useRoomStore((s) => s.hoveredId)
  const selectedId = useRoomStore((s) => s.selectedId)
  const setHovered = useRoomStore((s) => s.setHovered)
  const handleObjectClick = useRoomStore((s) => s.handleObjectClick)
  const device = useRoomStore((s) => s.devices[id])

  if (!device) return null

  const hovered = hoveredId === id
  const selected = selectedId === id
  const hot = hovered || selected
  const emphasise = childrenHighlight && hot ? 1.02 : 1

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{ deviceId: id, interactive: true }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        if (hoveredId === id) setHovered(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        handleObjectClick(id)
      }}
    >
      <group scale={emphasise}>{children}</group>
      {hot && (
        <Html
          position={labelOffset}
          center={!transform}
          transform={transform}
          distanceFactor={transform ? 6 : undefined}
          zIndexRange={[30, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className={`tag ${selected ? 'tag--selected' : ''}`}>
            <span className="tag__name">{device.name}</span>
            <span className="tag__action">{getPrimaryAction(device)}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
