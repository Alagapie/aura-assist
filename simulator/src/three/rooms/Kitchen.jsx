import { SmartLight } from '../appliances/SmartLight'
import { RoomFill } from '../appliances/RoomFill'
import { SmartPanel } from '../appliances/Switches'
import { Refrigerator, Cooker, RangeHood } from '../appliances/KitchenAppliances'
import { KitchenRun, DiningSet, NoticeBoard } from '../furniture/KitchenFurniture'
import { Plant } from '../furniture/Furniture'
import { PepperMill, UtensilCrock } from '../props/SmallProps'
import { DINING_TABLE } from '../../config/house'

/**
 * Kitchen (x:[4,9], z:[-3,3]), east of the living room.
 *
 *   - west  wall (x = 4): the cabinet run + sink (the door to the living room
 *     sits at z 0.7..1.7, so the run occupies the northern half)
 *   - east  wall (x = 9): fridge, cooker + hood, and the window between them
 *   - north wall (z = -3): door through to the bathroom
 *   - south wall (z = 3): door to the hall + control panel
 */
export function Kitchen() {
  return (
    <>
      {/* lighting */}
      <SmartLight kind="ceiling" id="kitchenLight" position={[6.5, 2.94, 0]} withShadow />
      <SmartLight
        kind="undercab"
        id="kitchenStrip"
        position={[4.18, 1.57, -0.15]}
        rotation={[0, Math.PI / 2, 0]}
        length={1.2}
      />
      <RoomFill roomId="kitchen" position={[6.6, 2.7, 0]} maxIntensity={28} distance={13} />

      {/* white goods */}
      <Refrigerator position={[8.6, 0, -2.1]} rotation={[0, -Math.PI / 2, 0]} />
      <Cooker position={[8.62, 0, 1.5]} rotation={[0, -Math.PI / 2, 0]} />
      <RangeHood position={[8.75, 2.05, 1.5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* wall control panel */}
      <SmartPanel id="kitchenPanel" label="KITCHEN" position={[4.6, 1.42, 2.93]} rotation={[0, Math.PI, 0]} />

      {/* fitted furniture */}
      <KitchenRun position={[4.03, 0, 0.55]} rotation={[0, Math.PI / 2, 0]} length={3.5} />
      {/* props on the worktop: a pepper mill and a crock of utensils */}
      <PepperMill position={[4.36, 0.935, -0.6]} />
      <UtensilCrock position={[4.36, 0.935, 0.18]} />
      <DiningSet position={DINING_TABLE.position} />
      <NoticeBoard position={[5.0, 1.7, -2.97]} rotation={[0, 0, 0]} />
      <Plant position={[8.55, 0, 2.5]} />
    </>
  )
}
