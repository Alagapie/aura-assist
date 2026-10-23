import { Curtains } from '../appliances/Curtains'
import { AirConditioner } from '../appliances/AirConditioner'
import { SmartLight } from '../appliances/SmartLight'
import { RoomFill } from '../appliances/RoomFill'
import { SmartPanel } from '../appliances/Switches'
import { Bed, BedsideTable, Wardrobe, BedroomBench } from '../furniture/BedroomFurniture'
import { Plant, Rug, WallArt } from '../furniture/Furniture'
import { Glasses, Remote } from '../props/SmallProps'

/**
 * Bedroom (x:[-4,4], z:[-9,-3]), north of the living room.
 *
 *   - north wall (z = -9): the big window + curtains, headboard against it
 *   - west  wall (x = -4): wardrobe and the second window
 *   - east  wall (x = +4): en-suite door (drawn by HouseShell) + split AC
 *   - south wall (z = -3): bedroom door (HouseShell) + control panel
 */
export function Bedroom() {
  return (
    <>
      {/* lighting */}
      <SmartLight kind="ceiling" id="bedroomLight" position={[0, 2.94, -6]} withShadow />
      <SmartLight kind="table" id="bedLampLeft" position={[0.93, 0.55, -8.75]} />
      <SmartLight kind="table" id="bedLampRight" position={[3.37, 0.55, -8.75]} />
      <RoomFill roomId="bedroom" position={[0.8, 2.7, -6.2]} maxIntensity={27} distance={13} />

      {/* climate */}
      <AirConditioner id="bedroomAC" position={[3.92, 2.45, -4.2]} rotation={[0, -Math.PI / 2, 0]} />

      {/* covers: one device drives both windows */}
      <Curtains id="bedroomCurtains" position={[-4, 0, -6]} span={1.9} />
      <Curtains id="bedroomCurtains" position={[0, 0, -9]} rotation={[0, -Math.PI / 2, 0]} span={2.5} />

      {/* wall control panel */}
      <SmartPanel id="bedroomPanel" label="BEDROOM" position={[0.4, 1.42, -3.06]} rotation={[0, Math.PI, 0]} />

      {/* furniture */}
      <Rug position={[1.2, 0.007, -6.1]} size={[2.2, 1.7]} />
      <Bed position={[2.15, 0, -7.9]} />
      <BedsideTable position={[0.93, 0, -8.75]} />
      <BedsideTable position={[3.37, 0, -8.75]} />
      {/* the bedside remote is paired with the bedroom AC */}
      <Remote id="bedroomRemote" position={[3.51, 0.567, -8.65]} rotation={[0, 0.15, 0]} />
      {/* reading glasses on the left bedside table, turned toward the room camera */}
      <Glasses position={[0.74, 0.56, -8.58]} rotation={[0, -0.47, 0]} />
      <Wardrobe position={[-3.7, 0, -7.8]} rotation={[0, Math.PI / 2, 0]} />
      <BedroomBench position={[2.15, 0, -6.45]} />

      {/* decor */}
      <WallArt position={[2.15, 2.02, -8.94]} variant={1} />
      <Plant position={[-3.4, 0, -3.5]} />
    </>
  )
}
