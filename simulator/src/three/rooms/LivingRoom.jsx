import { Curtains } from '../appliances/Curtains'
import { Television } from '../appliances/Television'
import { AirConditioner } from '../appliances/AirConditioner'
import { StandingFan } from '../appliances/StandingFan'
import { SmartLight } from '../appliances/SmartLight'
import { RoomFill } from '../appliances/RoomFill'
import { SwitchPlate, SmartPanel } from '../appliances/Switches'
import { Sofa } from '../furniture/Sofa'
import { Phone, Remote } from '../props/SmallProps'
import { SEAT_PLAN } from '../../config/house'
import {
  CoffeeTable, ConsoleTable, Plant, Rug, ShelfUnit, SideTable, TvStand, WallArt, WallClock,
} from '../furniture/Furniture'

/** The screen + seat arrangement, so the sofa provably faces the TV. */
const PLAN = SEAT_PLAN.living

/**
 * The living room exactly as it was in Phase 1: every appliance, every piece of
 * furniture and every interaction preserved, at its original coordinates. The
 * architecture (walls/floor/ceiling) and the door leaves now come from the
 * shared HouseShell, so this file only owns what lives *inside* the room.
 */
export function LivingRoom() {
  return (
    <>
      {/* lighting fixtures */}
      <SmartLight kind="ceiling" id="ceilingLightA" position={[-1.7, 2.94, -0.3]} withShadow />
      <SmartLight kind="ceiling" id="ceilingLightB" position={[1.7, 2.94, -0.3]} />
      <SmartLight kind="wall" id="sconceLeft" position={[-2.25, 2.02, -2.96]} />
      <SmartLight kind="wall" id="sconceRight" position={[2.25, 2.02, -2.96]} />
      <SmartLight kind="table" id="tableLamp" position={[1.85, 0.56, 1.55]} />
      <SmartLight kind="floor" id="floorLamp" position={[-3.3, 0, 2.45]} />
      <RoomFill roomId="living" position={[0, 2.7, 0]} maxIntensity={31} distance={14} />

      {/* media & climate */}
      <Television position={PLAN.focus.position} />
      <AirConditioner position={[3.92, 2.45, -1.5]} rotation={[0, -Math.PI / 2, 0]} />
      <StandingFan position={[3.0, 0, -1.4]} rotation={[0, -0.72, 0]} />

      {/* covers (the two door leaves are drawn once, centrally, by HouseShell) */}
      <Curtains position={[-4, 0, -0.7]} span={3.0} />

      {/* controls on the walls */}
      <SwitchPlate position={[-3.94, 1.25, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <SmartPanel id="hub" label="LIVING ROOM" position={[3.2, 1.42, -2.93]} />

      {/* furniture & decor */}
      <Rug />
      {/* The seat plan turns the sofa a half turn so its seat (local +Z) points
          north, at the TV: everyone watching the screen faces it. */}
      <Sofa position={PLAN.seat.position} rotation={[0, PLAN.seat.rotationY, 0]} />
      <CoffeeTable position={[0, 0, 0.55]} />
      {/* Small everyday props: a phone and the TV remote, both lying on the
          coffee table and both clickable (the remote toggles the TV). */}
      <Phone position={[-0.05, 0.4525, 0.72]} rotation={[0, 0.12, 0]} />
      <Remote id="tvRemote" position={[0.42, 0.457, 0.39]} rotation={[0, -0.5, 0]} />
      <TvStand position={[0, 0, -2.72]} />
      <SideTable position={[1.85, 0, 1.55]} />
      <ConsoleTable position={[0.9, 0, 2.74]} />
      <ShelfUnit position={[3.72, 0, 2.35]} rotation={[0, -Math.PI / 2, 0]} />
      <Plant position={[-3.38, 0, -2.3]} />
      <WallArt position={[-3.15, 1.72, -2.94]} variant={0} />
      <WallArt position={[3.94, 1.65, -2.6]} variant={1} rotation={[0, -Math.PI / 2, 0]} size={[0.5, 0.68]} />
      <WallClock position={[-1.7, 2.06, 2.94]} />
    </>
  )
}
