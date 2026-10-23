import { SmartLight } from '../appliances/SmartLight'
import { RoomFill } from '../appliances/RoomFill'
import { SmartPanel } from '../appliances/Switches'
import { SmartLock, Doorbell } from '../appliances/BathAndEntry'
import { HallConsole, Doormat, CoatHooks, SensorWallMount } from '../furniture/BathroomFixtures'
import { Plant, WallArt } from '../furniture/Furniture'

/**
 * Entrance hall (x:[-4,9], z:[3,5.5]), the spine that links every other room.
 *
 *   - north wall (z = 3): living-room door + kitchen door, plus the panel
 *   - south wall (z = 5.5): main entrance door with smart lock, doorbell,
 *     entry contact sensor and doormat
 *   - west / east walls: sidelights, console table and coat hooks
 */
export function Hallway() {
  return (
    <>
      {/* lighting */}
      <SmartLight kind="ceiling" id="hallLight" position={[2.5, 2.94, 4.25]} />
      <SmartLight kind="wall" id="porchLight" position={[1.1, 2.05, 5.42]} rotation={[0, Math.PI, 0]} />
      <RoomFill roomId="hallway" position={[2.5, 2.7, 4.2]} maxIntensity={25} distance={13} />

      {/* entry security: lock, bell, contact sensor */}
      <SmartLock position={[3.05, 1.05, 5.44]} rotation={[0, Math.PI, 0]} />
      <Doorbell position={[1.9, 1.28, 5.44]} rotation={[0, Math.PI, 0]} />
      <SensorWallMount id="entrySensor" position={[3.35, 2.05, 5.44]} rotation={[0, Math.PI, 0]} />

      {/* wall control panel */}
      <SmartPanel id="hallPanel" label="ENTRANCE" position={[4.9, 1.42, 3.06]} />

      {/* furniture */}
      <Doormat position={[2.6, 0.008, 5.05]} />
      <HallConsole position={[0.4, 0, 5.36]} rotation={[0, Math.PI, 0]} />
      <CoatHooks position={[-1.9, 0, 5.46]} rotation={[0, Math.PI, 0]} />
      <Plant position={[8.5, 0, 5.0]} />
      <WallArt position={[-3.9, 1.7, 4.25]} variant={0} rotation={[0, Math.PI / 2, 0]} />
    </>
  )
}
