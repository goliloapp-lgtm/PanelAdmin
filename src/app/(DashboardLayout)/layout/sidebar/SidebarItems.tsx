import React from "react";
import Menuitems from "./MenuItems";
import { Box, Typography } from "@mui/material";
import {
  Logo,
  Sidebar as MUI_Sidebar,
  Menu,
  MenuItem,
  Submenu,
} from "react-mui-sidebar";
import { IconPoint } from '@tabler/icons-react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Upgrade } from "./Updrade";
import Image from "next/image";
import { useAdmin } from "@/hooks/useAdmin";


const renderMenuItems = (items: any, pathDirect: any) => {

  return items.map((item: any) => {

    const Icon = item.icon ? item.icon : IconPoint;

    const itemIcon = <Icon stroke={1.5} size="1.3rem" />;

    if (item.subheader) {
      // Display Subheader
      return (
        <Menu
          subHeading={item.subheader}
          key={item.subheader}
        />
      );
    }

    //If the item has children (submenu)
    if (item.children) {
      return (
        <Submenu
          key={item.id}
          title={item.title}
          icon={itemIcon}
          borderRadius='7px'
        >
          {renderMenuItems(item.children, pathDirect)}
        </Submenu>
      );
    }

    // If the item has no children, render a MenuItem

    return (
      <Box px={3} key={item.id}>
        <MenuItem
          key={item.id}
          isSelected={pathDirect === item?.href}
          borderRadius='8px'
          icon={itemIcon}
          link={item.href}
          component={Link}
        >
          {item.title}
        </MenuItem >
      </Box>

    );
  });
};


const filterMenuItemsByRole = (items: any[], role: string | null) => {
  if (!role) return [];
  const normalizedRole = role.toLowerCase();

  return items.filter((item) => {
    // For Operations (operaciones)
    if (normalizedRole === 'operaciones') {
      if (item.subheader === 'PASAJEROS') return false;
      if (item.href === '/Passengers' || item.href === '/OffPassengers' || item.href === '/Employees') return false;
    }

    // For Customer Service (atencion_cliente)
    if (normalizedRole === 'atencion_cliente') {
      if (item.href === '/Employees') return false;
    }

    return true;
  });
};

const SidebarItems = () => {
  const pathname = usePathname();
  const pathDirect = pathname;
  const { roleName, isLoading } = useAdmin();

  const filteredMenuItems = React.useMemo(() => {
    if (isLoading) return [];
    return filterMenuItemsByRole(Menuitems, roleName);
  }, [roleName, isLoading]);

  return (
    < >
      <MUI_Sidebar width={"100%"} showProfile={false} themeColor={"#5D87FF"} themeSecondaryColor={'#49beff'} >

        {/* <Logo  img='/images/logos/Logo.png' component={Link} to="/" /> */}
        <Box sx={{ px: 3, py: 1.5, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'block', lineHeight: 0 }}>
            <img
              src="/images/logos/Logo.png"
              alt="Logo"
              style={{
                height: '52px',
                width: 'auto',
                display: 'block'
              }}
            />
          </Link>
        </Box>
        {!isLoading && renderMenuItems(filteredMenuItems, pathDirect)}
        
      </MUI_Sidebar>

    </>
  );
};
export default SidebarItems;
