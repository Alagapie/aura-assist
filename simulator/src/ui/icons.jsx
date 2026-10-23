import {
  AirVent, Bath, BedDouble, Bell, Blinds, Briefcase, CookingPot, DoorOpen, Eye, Fan, Film,
  Home, LayoutGrid, Lightbulb, Lock, Moon, Power, Refrigerator, ShowerHead, Smartphone, Sparkles,
  Sun, Thermometer, Tv, Utensils, Waves,
} from 'lucide-react'

/** Icon per device type / light kind. */
export function DeviceIcon({ device, size = 15 }) {
  const props = { size, strokeWidth: 1.9 }
  switch (device.type) {
    case 'light':
      return <Lightbulb {...props} />
    case 'tv':
      return <Tv {...props} />
    case 'ac':
      return <AirVent {...props} />
    case 'fan':
      return <Fan {...props} />
    case 'fridge':
      return <Refrigerator {...props} />
    case 'cooker':
      return <CookingPot {...props} />
    case 'shower':
      return <ShowerHead {...props} />
    case 'curtains':
      return <Blinds {...props} />
    case 'door':
      return <DoorOpen {...props} />
    case 'lock':
      return <Lock {...props} />
    case 'doorbell':
      return <Bell {...props} />
    case 'sensor':
      return device.sensorKind === 'water' ? <Waves {...props} /> : <Eye {...props} />
    case 'switch':
      return <LayoutGrid {...props} />
    case 'hub':
      return <Thermometer {...props} />
    case 'prop':
      switch (device.propKind) {
        case 'phone': return <Smartphone {...props} />
        case 'remote': return <Tv {...props} />
        case 'pepper': return <Sparkles {...props} />
        case 'utensils': return <Utensils {...props} />
        default: return <Power {...props} />
      }
    default:
      return <Power {...props} />
  }
}

/** Icon for an automation mode id. */
export function ModeIcon({ mode, size = 15 }) {
  const props = { size, strokeWidth: 2 }
  switch (mode) {
    case 'home': return <Home {...props} />
    case 'movie': return <Film {...props} />
    case 'bedtime': return <Moon {...props} />
    case 'away': return <Briefcase {...props} />
    case 'morning': return <Sun {...props} />
    default: return <Power {...props} />
  }
}

/** Icon for a room id (used by the navigation panel and the floor plan). */
export function RoomIcon({ room, size = 15 }) {
  const props = { size, strokeWidth: 1.9 }
  switch (room) {
    case 'living': return <Home {...props} />
    case 'bedroom': return <BedDouble {...props} />
    case 'kitchen': return <CookingPot {...props} />
    case 'bathroom': return <Bath {...props} />
    case 'hallway': return <DoorOpen {...props} />
    default: return <Home {...props} />
  }
}
