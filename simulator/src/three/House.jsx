import { Lighting } from './Lighting'
import { HouseShell } from './HouseShell'
import { Exterior } from './Exterior'
import { CameraRig } from './CameraRig'
import { WalkMode } from './WalkMode'
import { LivingRoom } from './rooms/LivingRoom'
import { Bedroom } from './rooms/Bedroom'
import { Kitchen } from './rooms/Kitchen'
import { Bathroom } from './rooms/Bathroom'
import { Hallway } from './rooms/Hallway'
import { useRoomStore } from '../store/useRoomStore'

/**
 * Scene root.
 *
 * The architectural shell is drawn once (HouseShell) and every room contributes
 * only what lives *inside* it, all reading from the one store. The camera rig
 * swaps between the orbit/overview/floor-plan navigation and the first-person
 * walkthrough.
 */
export function House() {
  const cameraMode = useRoomStore((s) => s.cameraMode)
  const view = useRoomStore((s) => s.view)
  const roomIsolation = useRoomStore((s) => s.roomIsolation)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  /* Isolated "one room on its own" view (see HouseShell): hide the exterior and
   * every other room's contents so the camera can orbit the room freely without
   * ever revealing anything outside it. */
  const isolated = cameraMode === 'orbit' && view === 'room' && roomIsolation
  const show = (id) => !isolated || currentRoom === id

  return (
    <>
      <Lighting />
      <HouseShell />
      {!isolated && <Exterior />}

      <group visible={show('living')}><LivingRoom /></group>
      <group visible={show('bedroom')}><Bedroom /></group>
      <group visible={show('kitchen')}><Kitchen /></group>
      <group visible={show('bathroom')}><Bathroom /></group>
      <group visible={show('hallway')}><Hallway /></group>

      {cameraMode === 'walk' ? <WalkMode /> : <CameraRig />}
    </>
  )
}
