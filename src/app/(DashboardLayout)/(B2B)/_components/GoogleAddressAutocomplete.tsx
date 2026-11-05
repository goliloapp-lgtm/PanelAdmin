"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
} from "@mui/material";
import { IconMapPin, IconX } from "@tabler/icons-react";
import { loadGoogleMapsScript } from "@/utils/googleMaps";

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  name?: string;
}

interface Props {
  value: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (selection: AddressSelection) => void;
  fullWidth?: boolean;
  size?: "small" | "medium";
}

export default function GoogleAddressAutocomplete({
  value,
  placeholder = "Buscar dirección o punto de referencia en El Salvador...",
  label,
  required = false,
  disabled = false,
  onChange,
  fullWidth = true,
  size = "small",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(value || "");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !inputRef.current) return;
        setIsLoading(false);

        const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "sv" },
          fields: ["formatted_address", "geometry", "name", "place_id"],
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place || !place.geometry || !place.geometry.location) {
            return;
          }

          const selectedAddress =
            place.formatted_address || place.name || inputRef.current?.value || "";
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          setInputValue(selectedAddress);
          onChange({
            address: selectedAddress,
            lat,
            lng,
            placeId: place.place_id,
            name: place.name,
          });
        });

        autocompleteRef.current = autocomplete;
      })
      .catch((err) => {
        if (active) {
          console.warn("[GoogleAddressAutocomplete] Fallback local:", err);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      if (autocompleteRef.current && window.google?.maps?.event) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    onChange({
      address: newVal,
      lat: 13.6929,
      lng: -89.2182,
    });
  };

  const handleClear = () => {
    setInputValue("");
    if (inputRef.current) inputRef.current.value = "";
    onChange({
      address: "",
      lat: 13.6929,
      lng: -89.2182,
    });
  };

  return (
    <TextField
      inputRef={inputRef}
      value={inputValue}
      onChange={handleInputChange}
      label={label}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <IconMapPin size={18} color="#5D87FF" />
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            {isLoading ? (
              <CircularProgress size={16} />
            ) : inputValue && !disabled ? (
              <IconButton size="small" onClick={handleClear} edge="end">
                <IconX size={14} />
              </IconButton>
            ) : null}
          </InputAdornment>
        ),
      }}
    />
  );
}
