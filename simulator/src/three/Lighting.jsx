import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Generates a small PMREM environment from three's own `RoomEnvironment`.
 * This gives every PBR material soft reflections without downloading an HDRI,
 * which keeps the project completely offline-capable.
 */
function EnvironmentSetup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04)
    scene.environment = env.texture
    // Deliberately low: the environment is only here to give PBR materials
    // soft reflections. If it were brighter it would light every room evenly
    // and switching the lamps off would barely change the picture.
    scene.environmentIntensity = 0.14
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
      if (room.dispose) room.dispose()
    }
  }, [gl, scene])

  return null
}

/**
 * Global lighting: a warm sun coming through the window wall, a cool bounce
 * fill, and a low ambient floor so shadowed corners never go fully black.
 */
export function Lighting() {
  return (
    <>
      <EnvironmentSetup />
      {/* Kept deliberately low: the fixtures (and the per-room bounce light)
          must be what makes a room bright, so switching them off reads as a
          real drop in light rather than no change at all. */}
      <ambientLight intensity={0.06} color="#dfe8f0" />
      <hemisphereLight intensity={0.04} color="#cfe0f0" groundColor="#5b4a3a" />

      {/* Sun through the left (window) wall. The shadow frustum has to cover the
          whole house (x:[-4,9], z:[-9,5.5]) and is aimed at the house centre. */}
      <directionalLight
        castShadow
        position={[-8.5, 9.5, 5.5]}
        intensity={1.55}
        color="#fff1d6"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      >
        <object3D attach="target" position={[2.5, 0, -1.75]} />
      </directionalLight>

      {/* Cool sky bounce from the opposite side, no shadows (cheap fill) */}
      <directionalLight position={[5, 3.4, -4]} intensity={0.18} color="#bcd4ee" />
    </>
  )
}
