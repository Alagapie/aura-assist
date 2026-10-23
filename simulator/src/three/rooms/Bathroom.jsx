import { Shower, ExhaustFan, SensorPuck } from '../appliances/BathAndEntry'
import { SmartLight } from '../appliances/SmartLight'
import { RoomFill } from '../appliances/RoomFill'
import { Toilet, Vanity, TowelWarmer, BathMat, SensorWallMount } from '../furniture/BathroomFixtures'
import { Plant } from '../furniture/Furniture'

/**
 * Bathroom (x:[4,9], z:[-9,-3]).
 *
 *   - south wall (z = -3): vanity + mirror light (door to the kitchen beside it)
 *   - west  wall (x = 4): toilet + towel rail (en-suite door beside them)
 *   - north wall (z = -9): frosted window + occupancy sensor
 *   - east  wall (x = 9): frosted window, walk-in shower in the NE corner
 */
export function Bathroom() {
  return (
    <>
      {/* lighting + ventilation */}
      <SmartLight kind="ceiling" id="bathroomLight" position={[6.5, 2.94, -4.6]} />
      <SmartLight kind="vanity" id="mirrorLight" position={[5.0, 2.34, -2.99]} rotation={[0, Math.PI, 0]} length={0.9} />
      <ExhaustFan id="bathFan" position={[6.5, 2.96, -6.5]} />
      <RoomFill roomId="bathroom" position={[6.6, 2.7, -6]} maxIntensity={27} distance={12} />

      {/* walk-in shower (a real device: water on/off + temperature) */}
      <Shower position={[8.3, 0, -8.1]} />

      {/* fixtures */}
      <Vanity position={[5.0, 0, -2.99]} rotation={[0, Math.PI, 0]} />
      <Toilet position={[4.47, 0, -7.3]} rotation={[0, Math.PI / 2, 0]} />
      <TowelWarmer position={[4.12, 0, -4.4]} rotation={[0, Math.PI / 2, 0]} />
      <BathMat position={[6.1, 0.008, -7.2]} size={[1.1, 0.7]} />
      <Plant position={[8.6, 0, -3.5]} />

      {/* simulated sensors */}
      <SensorWallMount id="occupancySensor" position={[4.6, 2.35, -8.96]} rotation={[0, 0, 0]} />
      <SensorPuck id="waterSensor" position={[7.0, 0.016, -7.9]} rotation={[0, 0, 0]} />
    </>
  )
}
