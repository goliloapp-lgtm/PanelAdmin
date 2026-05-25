import {
  IconRouteX,
  IconCarOff,
  IconLayoutDashboard,
  IconUser,
  IconRouteSquare,
  IconCar,
  IconUserExclamation,
} from "@tabler/icons-react";

import { uniqueId } from "lodash";
 
const Menuitems = [
  {
    navlabel: true,
    subheader: "HOME",
  },

  {
    id: uniqueId(),
    title: "Dashboard",
    icon: IconLayoutDashboard,
    href: "/",
  },
  {
    navlabel: true,
    subheader: "CONDUCTORES",
  },
  {
    id: uniqueId(),
    title: "Verificados",
    icon: IconCar,
    href: "/ActiveRiders",
  },
  {
    id: uniqueId(),
    title: "Sin Verificar",
    icon: IconCarOff,
    href: "/UnverifiedRiders",
  },
  {
    navlabel: true,
    subheader: "PASAJEROS",
  },
  {
    id: uniqueId(),
    title: "Activos",
    icon: IconUser,
    href: "/Passengers",
  },
  {
    id: uniqueId(),
    title: "De Baja",
    icon: IconUserExclamation,
    href: "/OffPassengers",
  },
  {
    navlabel: true,
    subheader: "TRANSACCIONES",
  },
  {
    id: uniqueId(),
    title: "Viajes Completados",
    icon: IconRouteSquare,
    href: "/Viajes",
  },
  {
    id: uniqueId(),
    title: "Viajes Cancelados",
    icon: IconRouteX,
    href: "/Viajes-cancelados",
  },

];

export default Menuitems;


