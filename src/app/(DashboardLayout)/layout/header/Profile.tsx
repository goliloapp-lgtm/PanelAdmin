import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Avatar,
  Box,
  Menu,
  Button,
  IconButton,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { logout } from "@/utils/auth";
import { IconUser } from "@tabler/icons-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { firebaseApp } from "@/utils/firebase";

const Profile = () => {
  const [anchorEl2, setAnchorEl2] = useState(null);
  const [userPhoto, setUserPhoto] = useState<string>("/images/profile/user-1.jpg");
  const [userName, setUserName] = useState<string>("");

  const handleClick2 = (event: any) => {
    setAnchorEl2(event.currentTarget);
  };
  const handleClose2 = () => {
    setAnchorEl2(null);
  };

  useEffect(() => {
    const auth = getAuth(firebaseApp);
    const db = getFirestore(firebaseApp);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.photoURL) {
          setUserPhoto(user.photoURL);
        }
        if (user.displayName) {
          setUserName(user.displayName);
        }

        // Listen in real-time to Firestore user profile changes
        const userRef = doc(db, "users", user.uid);
        const unsubscribeUser = onSnapshot(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              const photo = data.profileImageUrl || data.profilePhoto || user.photoURL;
              if (photo) {
                setUserPhoto(photo);
              }
              const name = data.firstName || data.lastName 
                ? `${data.firstName || ""} ${data.lastName || ""}`.trim()
                : user.displayName;
              if (name) {
                setUserName(name);
              }
            }
          },
          (error) => {
            console.error("Error listening to user changes:", error);
          }
        );

        return () => unsubscribeUser();
      } else {
        setUserPhoto("/images/profile/user-1.jpg");
        setUserName("");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <Box>
      <IconButton
        size="large"
        aria-label="show user menu"
        color="inherit"
        aria-controls="msgs-menu"
        aria-haspopup="true"
        sx={{
          ...(typeof anchorEl2 === "object" && {
            color: "primary.main",
          }),
        }}
        onClick={handleClick2}
      >
        <Avatar
          src={userPhoto}
          alt={userName || "usuario"}
          sx={{
            width: 35,
            height: 35,
          }}
        />
      </IconButton>
      <Menu
        id="msgs-menu"
        anchorEl={anchorEl2}
        keepMounted
        open={Boolean(anchorEl2)}
        onClose={handleClose2}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiMenu-paper": {
            width: "200px",
          },
        }}
      >
        <MenuItem component={Link} href="/profile" onClick={handleClose2}>
          <ListItemIcon>
            <IconUser width={20} />
          </ListItemIcon>
          <ListItemText>Mi Perfil</ListItemText>
        </MenuItem>
        <Box mt={1} py={1} px={2}>
          <Button
            href="/authentication/login"
            variant="outlined"
            color="primary"
            component={Link}
            fullWidth
            onClick={logout}
          >
            Logout
          </Button>
        </Box>
      </Menu>
    </Box>
  );
};

export default Profile;
